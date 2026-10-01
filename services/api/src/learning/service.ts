import { paidSetupStateSchema, type PaidSetupState } from "@adaptive-labs/contracts";
import { withTransaction, type Database, type Transaction } from "@adaptive-labs/db";
import { HttpError } from "../http-error.js";
import type { LearningReasoningProvider,LearnerReasoningInput,ConfirmedScopeInput } from "./reasoning.js";
import { extractDocumentText,type SupportedDocumentMimeType } from "../documents/extract-text.js";
import { bootstrapTrialRunway } from "../continuation/service.js";

type Status=PaidSetupState["status"];
type ContextRow={learnerId:string;goalId:string;revision:number;status:Status;jdText:string|null;targetCompany:string|null;productStyle:string|null;targetDepth:"BASIC"|"STANDARD"|"DEEP";failureCode:string|null;targetPath:ConfirmedScopeInput["targetPath"]|null};
const transitions:Record<Status,Status[]>={
  TRIAL_PAID_SETUP_PENDING:["TRIAL_SCOPE_PROPOSED"], TRIAL_SCOPE_PROPOSED:["TRIAL_SCOPE_CONFIRMED"],
  TRIAL_SCOPE_CONFIRMED:["TRIAL_GENERATING"], TRIAL_GENERATING:["TRIAL_READY","TRIAL_GENERATION_FAILED"],
  TRIAL_READY:[],TRIAL_GENERATION_FAILED:["TRIAL_GENERATING"],
};
async function locked(client:Transaction,id:string) {
  const result=await client.query<ContextRow>(`SELECT learner_id "learnerId",goal_id "goalId",revision,status,jd_text "jdText",
    target_company "targetCompany",product_style "productStyle",target_depth "targetDepth",failure_code "failureCode",target_path "targetPath" FROM paid_setup_contexts WHERE learner_id=$1 FOR UPDATE`,[id]);
  return result.rows[0];
}
async function move(client:Transaction,row:ContextRow,to:Status,reason:string) {
  if (!transitions[row.status].includes(to)) throw new HttpError(409,"INVALID_SETUP_TRANSITION",`Cannot move from ${row.status} to ${to}`);
  const revision=row.revision+1;
  await client.query(`UPDATE paid_setup_contexts SET status=$2,revision=$3,failure_code=NULL,updated_at=now() WHERE learner_id=$1`,[row.learnerId,to,revision]);
  await client.query(`INSERT INTO paid_setup_state_events(learner_id,revision,from_status,to_status,reason) VALUES($1,$2,$3,$4,$5)`,[row.learnerId,revision,row.status,to,reason]);
  return revision;
}

export type DependencySelectionConcept={key:string;selected:boolean;satisfied:boolean;prerequisites:string[]};
export function closePrerequisiteSelection(concepts:DependencySelectionConcept[]){
  const byKey=new Map(concepts.map(concept=>[concept.key,concept]));
  const selected=new Set(concepts.filter(concept=>concept.selected&&!concept.satisfied).map(concept=>concept.key));
  const pending=[...selected];
  while(pending.length){
    const concept=byKey.get(pending.pop()!);if(!concept)continue;
    for(const prerequisiteKey of new Set(concept.prerequisites)){
      const prerequisite=byKey.get(prerequisiteKey);
      if(!prerequisite)throw new Error("PROPOSAL_PREREQUISITE_NOT_FOUND");
      if(prerequisite.satisfied||selected.has(prerequisiteKey))continue;
      selected.add(prerequisiteKey);pending.push(prerequisiteKey);
    }
  }
  return selected;
}

export function selectTrialRunwayConcepts<T extends {key:string;prerequisites:string[]}>(concepts:T[],limit=6){
  const byKey=new Map(concepts.map(c=>[c.key,c])),visiting=new Set<string>(),visited=new Set<string>(),ordered:T[]=[];
  const visit=(concept:T)=>{if(visited.has(concept.key))return;if(visiting.has(concept.key))throw new Error("CONCEPT_DEPENDENCY_CYCLE");visiting.add(concept.key);for(const dependency of concept.prerequisites){const prerequisite=byKey.get(dependency);if(prerequisite)visit(prerequisite);}visiting.delete(concept.key);visited.add(concept.key);ordered.push(concept);};
  for(const concept of concepts)visit(concept);
  return ordered.slice(0,Math.min(limit,ordered.length));
}

export class LearningSetupService {
  constructor(private readonly pool:Database,private readonly entitlementKey:string,private readonly reasoning:LearningReasoningProvider|null=null) {}
  private requireReasoning(){if(!this.reasoning) throw new HttpError(503,"AI_REASONING_NOT_CONFIGURED","OpenAI reasoning is not configured");return this.reasoning;}
  async readJdDocument(id:string,input:{filename:string;mimeType:string;contentBase64:string}){
    const active=await this.pool.query(`SELECT 1 FROM learner_entitlements e JOIN paid_setup_contexts c USING(learner_id) WHERE e.learner_id=$1 AND e.entitlement_key=$2 AND e.status='ACTIVE'`,[id,this.entitlementKey]);
    if(!active.rowCount)throw new HttpError(403,"PAID_SETUP_REQUIRED","A verified active entitlement and started paid setup are required");
    const bytes=Buffer.from(input.contentBase64,"base64");
    if(bytes.length>2*1024*1024)throw new HttpError(413,"JD_TOO_LARGE","Job description limit is 2 MiB");
    console.info("[jd] upload received",{filename:input.filename,mimeType:input.mimeType,byteLength:bytes.length,bytesRead:bytes.length>0});
    const text=await extractDocumentText(bytes,input.mimeType as SupportedDocumentMimeType,input.filename,"JD");
    return{filename:input.filename,mimeType:input.mimeType,text};
  }
  private async reasoningInput(id:string):Promise<LearnerReasoningInput>{
    const result=await this.pool.query<any>(`SELECT g.target goal,p.role_title role,p.experience_years::float "experienceYears",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('name',s.name,'canonicalName',COALESCE(ns.canonical_name,s.name),'level',s.level,'source',s.source) ORDER BY s.position)
        FROM learner_skill_assessments s LEFT JOIN normalized_skill_aliases a ON a.normalized_alias=lower(btrim(s.name)) LEFT JOIN normalized_skills ns USING(canonical_id) WHERE s.learner_id=$1),'[]') skills,
      COALESCE((SELECT jsonb_agg(interest ORDER BY position) FROM learner_interests WHERE learner_id=$1),'[]') interests,
      lp.timeline_days "timelineDays",lp.pace,c.jd_text "jdText",c.target_company "targetCompany",c.product_style "productStyle",c.target_depth "targetDepth"
      FROM learner_goal_intents g JOIN learner_setup_profiles p USING(learner_id) JOIN learner_learning_preferences lp USING(learner_id)
      JOIN paid_setup_contexts c USING(learner_id) WHERE g.learner_id=$1`,[id]);
    if(!result.rows[0]) throw new HttpError(404,"SETUP_NOT_STARTED","Start paid setup first");return {learnerId:id,...result.rows[0]};
  }
  async start(id:string) {
    await withTransaction(this.pool,async client=>{
      const eligible=await client.query(`SELECT 1 FROM learner_entitlements e JOIN onboarding_states o USING(learner_id)
        WHERE e.learner_id=$1 AND e.entitlement_key=$2 AND e.status='ACTIVE' AND o.completed`,[id,this.entitlementKey]);
      if (!eligible.rowCount) throw new HttpError(403,"PAID_SETUP_REQUIRED","A verified entitlement and completed onboarding are required");
      const goal=await client.query<{goalId:string}>(`SELECT goal_id "goalId" FROM learner_goal_intents WHERE learner_id=$1`,[id]);
      if (!goal.rows[0]) throw new HttpError(422,"GOAL_REQUIRED","A learner goal is required");
      const inserted=await client.query(`INSERT INTO paid_setup_contexts(learner_id,goal_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[id,goal.rows[0].goalId]);
      if (inserted.rowCount) await client.query(`INSERT INTO paid_setup_state_events(learner_id,revision,to_status,reason)
        VALUES($1,0,'TRIAL_PAID_SETUP_PENDING','verified entitlement')`,[id]);
    });
    return this.read(id);
  }
  async saveContext(id:string,revision:number,input:{jdText:string|null;targetCompany:string|null;productStyle:string|null;targetDepth:"BASIC"|"STANDARD"|"DEEP"}) {
    await withTransaction(this.pool,async client=>{
      const row=await locked(client,id); if(!row) throw new HttpError(404,"SETUP_NOT_STARTED","Start paid setup first");
      if(row.revision!==revision) throw new HttpError(409,"STALE_REVISION","Reload paid setup before saving");
      if(row.status!=="TRIAL_PAID_SETUP_PENDING") throw new HttpError(409,"SCOPE_ALREADY_PROPOSED","Context is locked after scope proposal");
      const next=revision+1;
      await client.query(`UPDATE paid_setup_contexts SET jd_text=$2,target_company=$3,product_style=$4,target_depth=$5,revision=$6,updated_at=now() WHERE learner_id=$1`,[id,input.jdText,input.targetCompany,input.productStyle,input.targetDepth,next]);
      await client.query(`DELETE FROM target_requirements WHERE learner_id=$1`,[id]);
    });
    return this.read(id);
  }
  async propose(id:string,revision:number) {
    const provider=this.requireReasoning();
    const before=await this.pool.query<ContextRow>(`SELECT learner_id "learnerId",goal_id "goalId",revision,status,jd_text "jdText",target_company "targetCompany",product_style "productStyle",target_depth "targetDepth",failure_code "failureCode",target_path "targetPath" FROM paid_setup_contexts WHERE learner_id=$1`,[id]);
    if(!before.rows[0]) throw new HttpError(404,"SETUP_NOT_STARTED","Start paid setup first");
    if(before.rows[0].status==="TRIAL_SCOPE_PROPOSED") return this.read(id);
    if(before.rows[0].revision!==revision) throw new HttpError(409,"STALE_REVISION","Reload paid setup before proposing scope");
    let reasoned;
    try{reasoned=await provider.propose(await this.reasoningInput(id));}catch{throw new HttpError(503,"AI_REASONING_FAILED","Could not build the personalized learning map; retry is safe");}
    await withTransaction(this.pool,async client=>{
      const row=await locked(client,id); if(!row) throw new HttpError(404,"SETUP_NOT_STARTED","Start paid setup first");
      if(row.revision!==revision) throw new HttpError(409,"STALE_REVISION","Reload paid setup before proposing scope");
      if(row.status!=="TRIAL_PAID_SETUP_PENDING") throw new HttpError(409,"INVALID_SETUP_TRANSITION","Setup is not ready for a proposal");
      const next=await move(client,row,"TRIAL_SCOPE_PROPOSED","OpenAI proposed a personalized scope");
      await client.query(`UPDATE paid_setup_contexts SET target_path=$2,reasoning_provider=$3,reasoning_model=$4,proposal_response_id=$5 WHERE learner_id=$1`,[id,reasoned.value.targetPath,provider.provider,provider.model,reasoned.responseId]);
      await client.query(`DELETE FROM target_requirements WHERE learner_id=$1`,[id]);
      for(const [position,r] of reasoned.value.requirements.entries()) await client.query(`INSERT INTO target_requirements(learner_id,revision,name,classification,reason,source,position) VALUES($1,$2,$3,$4,$5,$6,$7)`,[id,next,r.name,r.classification,r.reason,r.source,position]);
      const scope=await client.query<{scopeId:string}>(`INSERT INTO learning_scopes(learner_id,revision,status) VALUES($1,$2,'PROPOSED') RETURNING scope_id "scopeId"`,[id,next]);
      const conceptIds=new Map<string,string>();let position=0;
      for(const [capPosition,cap] of reasoned.value.capabilities.entries()){
        const capabilityId=`ai-${id}-${cap.key}`;
        await client.query(`INSERT INTO capabilities(capability_id,domain,tab,name,reason,scenario,position,learner_id,origin,external_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'AI_GENERATED',$9)`,[capabilityId,reasoned.value.targetPath,cap.tab,cap.name,cap.reason,cap.scenario,capPosition,id,cap.key]);
        for(const [conceptPosition,c] of cap.concepts.entries()){
          const conceptId=`ai-${id}-${c.key}`;conceptIds.set(c.key,conceptId);
          await client.query(`INSERT INTO concepts(concept_id,capability_id,name,short_example,requirement_class,depth_category,aliases,position,origin,external_key,recommendation_reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'AI_GENERATED',$9,$10)`,[conceptId,capabilityId,c.name,c.shortExample,c.requirementClass,c.depthCategory,c.aliases.map(x=>x.toLowerCase()),conceptPosition,c.key,c.recommendationReason]);
        }
      }
      const reported=await client.query<{canonicalName:string;source:string}>(`SELECT COALESCE(ns.canonical_name,s.name) "canonicalName",s.source FROM learner_skill_assessments s LEFT JOIN normalized_skill_aliases a ON a.normalized_alias=lower(btrim(s.name)) LEFT JOIN normalized_skills ns USING(canonical_id) WHERE s.learner_id=$1`,[id]);
      const proven=await client.query<{name:string;aliases:string[]}>(`SELECT c.name,c.aliases FROM learner_concept_state s JOIN concepts c USING(concept_id) WHERE s.learner_id=$1 AND s.relationship='KNOWN_PROVEN'`,[id]);
      const known=new Map(reported.rows.map(x=>[x.canonicalName.toLowerCase(),x.source]));
      const provenNames=new Set(proven.rows.flatMap(x=>[x.name,...x.aliases].map(name=>name.toLowerCase())));
      const normalized=new Map(reasoned.value.capabilities.flatMap(cap=>cap.concepts).map(c=>{
        const knownSource=known.get(c.name.toLowerCase())??c.aliases.map(x=>known.get(x.toLowerCase())).find(Boolean);
        const isProven=provenNames.has(c.name.toLowerCase())||c.aliases.some(alias=>provenNames.has(alias.toLowerCase()));
        const relationship=isProven?"KNOWN_PROVEN":knownSource?"KNOWN_REPORTED":c.relationship==="KNOWN_REPORTED"?"RECOMMENDED_NEXT":c.relationship;
        return[c.key,{knownSource,isProven,relationship}] as const;
      }));
      const defaultSelection=closePrerequisiteSelection(reasoned.value.capabilities.flatMap(cap=>cap.concepts).map(c=>({
        key:c.key,selected:c.selected&&c.relationship!=="NOT_RELEVANT",satisfied:["KNOWN_REPORTED","KNOWN_PROVEN"].includes(normalized.get(c.key)!.relationship),prerequisites:c.prerequisites,
      })));
      for(const cap of reasoned.value.capabilities) for(const c of cap.concepts){
        const conceptId=conceptIds.get(c.key)!;const state=normalized.get(c.key)!;
        const source=state.isProven?"PROJECT":state.knownSource?(state.knownSource==="CV_CONFIRMED"?"CV_CONFIRMED":"SELF_REPORT"):null;
        await client.query(`INSERT INTO learner_concept_state(learner_id,concept_id,revision,relationship,evidence_source) VALUES($1,$2,$3,$4,$5)
          ON CONFLICT(learner_id,concept_id) DO UPDATE SET revision=$3,relationship=$4,evidence_source=$5,updated_at=now()`,[id,conceptId,next,state.relationship,source]);
        const selected=defaultSelection.has(c.key);
        await client.query(`INSERT INTO learning_scope_items(scope_id,concept_id,selected,selection_source,position) VALUES($1,$2,$3,$4,$5)`,[scope.rows[0]!.scopeId,conceptId,selected,state.knownSource||state.isProven?"KNOWN":"RECOMMENDATION",position++]);
      }
      for(const cap of reasoned.value.capabilities) for(const c of cap.concepts) for(const dependency of c.prerequisites)
        await client.query(`INSERT INTO concept_dependencies(concept_id,prerequisite_concept_id) VALUES($1,$2)`,[conceptIds.get(c.key),conceptIds.get(dependency)]);
    });
    return this.read(id);
  }
  async select(id:string,revision:number,items:{conceptId:string;selected:boolean}[]) {
    await withTransaction(this.pool,async client=>{
      const row=await locked(client,id); if(!row) throw new HttpError(404,"SETUP_NOT_STARTED","Start paid setup first");
      if(row.revision!==revision) throw new HttpError(409,"STALE_REVISION","Reload paid setup before saving");
      if(row.status!=="TRIAL_SCOPE_PROPOSED") throw new HttpError(409,"SCOPE_NOT_EDITABLE","Only a proposed scope can be edited");
      const scope=await client.query<{scopeId:string}>(`SELECT scope_id "scopeId" FROM learning_scopes WHERE learner_id=$1 AND status='PROPOSED' ORDER BY revision DESC LIMIT 1`,[id]);
      for(const item of items) {
        const updated=await client.query(`UPDATE learning_scope_items i SET selected=$3,selection_source='LEARNER' FROM learner_concept_state s
          WHERE i.scope_id=$1 AND i.concept_id=$2 AND s.learner_id=$4 AND s.concept_id=i.concept_id AND s.relationship<>'KNOWN_REPORTED'`,[scope.rows[0]!.scopeId,item.conceptId,item.selected,id]);
        if(!updated.rowCount) throw new HttpError(422,"UNKNOWN_OR_READ_ONLY_CONCEPT","Concept is unknown or already known");
      }
      await client.query(`UPDATE paid_setup_contexts SET revision=revision+1,updated_at=now() WHERE learner_id=$1`,[id]);
    });
    return this.read(id);
  }
  async confirm(id:string,revision:number) {
    await withTransaction(this.pool,async client=>{
      const row=await locked(client,id); if(!row) throw new HttpError(404,"SETUP_NOT_STARTED","Start paid setup first");
      if(row.status==="TRIAL_SCOPE_CONFIRMED") return;
      if(row.revision!==revision) throw new HttpError(409,"STALE_REVISION","Reload paid setup before confirming");
      const scope=await client.query<{scopeId:string}>(`SELECT scope_id "scopeId" FROM learning_scopes WHERE learner_id=$1 AND status='PROPOSED' ORDER BY revision DESC LIMIT 1`,[id]);
      if(!scope.rows[0]) throw new HttpError(422,"SCOPE_REQUIRED","Propose a scope first");
      const missing=await client.query(`SELECT 1 FROM learning_scope_items chosen JOIN concept_dependencies d ON d.concept_id=chosen.concept_id
        JOIN learning_scope_items prereq ON prereq.scope_id=chosen.scope_id AND prereq.concept_id=d.prerequisite_concept_id
        JOIN learner_concept_state ps ON ps.learner_id=$2 AND ps.concept_id=prereq.concept_id
        WHERE chosen.scope_id=$1 AND chosen.selected AND NOT prereq.selected AND ps.relationship NOT IN ('KNOWN_REPORTED','KNOWN_PROVEN') LIMIT 1`,[scope.rows[0].scopeId,id]);
      if(missing.rowCount) throw new HttpError(422,"MISSING_PREREQUISITE","Select prerequisites or deselect dependent concepts");
      const count=await client.query<{n:number}>(`SELECT count(*)::int n FROM learning_scope_items WHERE scope_id=$1 AND selected`,[scope.rows[0].scopeId]);
      if(count.rows[0]!.n<2) throw new HttpError(422,"SCOPE_TOO_SMALL","Select at least two concepts");
      const next=await move(client,row,"TRIAL_SCOPE_CONFIRMED","learner confirmed scope");
      await client.query(`UPDATE learning_scopes SET status='CONFIRMED',revision=$2,confirmed_at=now() WHERE scope_id=$1`,[scope.rows[0].scopeId,next]);
    });
    return this.read(id);
  }
  async generate(id:string,revision:number,failForTest=false) {
    const provider=this.requireReasoning();
    let scopeId="";
    const existing=await this.read(id);
    const active=await this.pool.query(`SELECT 1 FROM learner_entitlements WHERE learner_id=$1 AND entitlement_key=$2 AND status='ACTIVE'`,[id,this.entitlementKey]);
    if(!active.rowCount) throw new HttpError(403,"PAID_SETUP_REQUIRED","A verified active entitlement is required");
    if(existing.status==="TRIAL_READY") return existing;
    await withTransaction(this.pool,async client=>{
      const row=await locked(client,id); if(!row) throw new HttpError(404,"SETUP_NOT_STARTED","Start paid setup first");
      if(row.revision!==revision) throw new HttpError(409,"STALE_REVISION","Reload paid setup before generation");
      const scope=await client.query<{scopeId:string}>(`SELECT scope_id "scopeId" FROM learning_scopes WHERE learner_id=$1 AND status='CONFIRMED' ORDER BY revision DESC LIMIT 1`,[id]);
      if(!scope.rows[0]) throw new HttpError(422,"CONFIRMED_SCOPE_REQUIRED","Confirm learning scope first"); scopeId=scope.rows[0].scopeId;
      await move(client,row,"TRIAL_GENERATING",row.status==="TRIAL_GENERATION_FAILED"?"generation retry":"generation started");
      await client.query(`INSERT INTO generation_runs(learner_id,scope_id,revision,status) VALUES($1,$2,$3,'RUNNING')
        ON CONFLICT(scope_id) DO UPDATE SET revision=$3,status='RUNNING',error_code=NULL,started_at=now(),finished_at=NULL`,[id,scopeId,revision+1]);
    });
    try {
      if(failForTest) throw new Error("SIMULATED_GENERATION_FAILURE");
      const context=await this.pool.query<{targetPath:ConfirmedScopeInput["targetPath"]}>(`SELECT target_path "targetPath" FROM paid_setup_contexts WHERE learner_id=$1`,[id]);
      const chosen=await this.pool.query<any>(`SELECT cap.name capability,cap.reason,cap.scenario,c.external_key "key",c.name,c.short_example "shortExample",c.depth_category "depthCategory",c.requirement_class "requirementClass",
        COALESCE((SELECT jsonb_agg(pc.external_key) FROM concept_dependencies d JOIN concepts pc ON pc.concept_id=d.prerequisite_concept_id WHERE d.concept_id=c.concept_id),'[]') prerequisites
        FROM learning_scope_items i JOIN concepts c USING(concept_id) JOIN capabilities cap USING(capability_id) WHERE i.scope_id=$1 AND i.selected AND c.origin='AI_GENERATED' AND cap.origin='AI_GENERATED' AND cap.learner_id=$2 ORDER BY i.position`,[scopeId,id]);
      const runwayConcepts=selectTrialRunwayConcepts(chosen.rows,6);
      const runwayKeys=new Set(runwayConcepts.map(x=>x.key));
      const byCapability=new Map<string,ConfirmedScopeInput["capabilities"][number]>();for(const item of runwayConcepts){let cap=byCapability.get(item.capability);if(!cap){cap={name:item.capability,reason:item.reason,scenario:item.scenario,concepts:[]};byCapability.set(item.capability,cap);}cap.concepts.push({key:item.key,name:item.name,shortExample:item.shortExample,depthCategory:item.depthCategory,requirementClass:item.requirementClass,prerequisites:item.prerequisites.filter((key:string)=>runwayKeys.has(key))});}
      const modelInput:ConfirmedScopeInput={...(await this.reasoningInput(id)),targetPath:context.rows[0]!.targetPath,capabilities:[...byCapability.values()]};
      const generated=await provider.generateUnits(modelInput);
      const expected=runwayConcepts.map(x=>x.key).sort();const actual=generated.value.units.flatMap(x=>x.conceptKeys).sort();
      if(expected.length!==actual.length||expected.some((x,i)=>x!==actual[i])||new Set(actual).size!==actual.length) throw new Error("INVALID_UNIT_CONCEPT_COVERAGE");
      await withTransaction(this.pool,async client=>{
        const row=await locked(client,id); if(!row||row.status!=="TRIAL_GENERATING") throw new HttpError(409,"GENERATION_STATE_CHANGED","Generation state changed");
        const entitlement=await client.query(`SELECT 1 FROM learner_entitlements WHERE learner_id=$1 AND entitlement_key=$2 AND status='ACTIVE' FOR SHARE`,[id,this.entitlementKey]);
        if(!entitlement.rowCount) throw new HttpError(403,"PAID_SETUP_REQUIRED","The verified entitlement is no longer active");
        await client.query(`DELETE FROM learning_units WHERE scope_id=$1`,[scopeId]);
        const runwayUnits:{unitId:string;sequence:number;title:string;labOutcome:string}[]=[];
        for(const unitPlan of generated.value.units) {
          const unit=await client.query<{unitId:string}>(`INSERT INTO learning_units(learner_id,scope_id,sequence,title,goal,prerequisites,product_context,grouping_reason,lab_outcome_placeholder)
            VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9) RETURNING unit_id "unitId"`,[id,scopeId,unitPlan.sequence,unitPlan.title,unitPlan.goal,JSON.stringify(unitPlan.prerequisiteNames),unitPlan.productContext,unitPlan.groupingReason,unitPlan.futureLabOutcome]);
          for(const [position,conceptKey] of unitPlan.conceptKeys.entries()) {const concept=await client.query<{id:string}>(`SELECT concept_id id FROM concepts c JOIN capabilities cap USING(capability_id) WHERE cap.learner_id=$1 AND c.external_key=$2`,[id,conceptKey]);await client.query(`INSERT INTO learning_unit_concepts(unit_id,concept_id,position) VALUES($1,$2,$3)`,[unit.rows[0]!.unitId,concept.rows[0]!.id,position]);}
          runwayUnits.push({unitId:unit.rows[0]!.unitId,sequence:unitPlan.sequence,title:unitPlan.title,labOutcome:unitPlan.futureLabOutcome});
        }
        const runwayId=await bootstrapTrialRunway(client,id,row.goalId,scopeId,runwayUnits);
        const future=chosen.rows.filter(x=>!runwayKeys.has(x.key)).map(x=>({conceptKey:x.key,name:x.name,depthCategory:x.depthCategory,requirementClass:x.requirementClass}));
        await client.query(`UPDATE learning_runways SET discovered_future_scope=$2::jsonb WHERE runway_id=$1`,[runwayId,JSON.stringify(future)]);
        await move(client,row,"TRIAL_READY","exactly two unit definitions generated");
        await client.query(`UPDATE generation_runs SET status='SUCCEEDED',provider=$2,model=$3,response_id=$4,finished_at=now() WHERE scope_id=$1`,[scopeId,provider.provider,provider.model,generated.responseId]);
        await client.query(`UPDATE learner_trial_states SET status='ACTIVE',updated_at=now() WHERE learner_id=$1 AND status='ACTIVE_SETUP_PENDING'`,[id]);
      });
    } catch(error) {
      await withTransaction(this.pool,async client=>{ const row=await locked(client,id); if(row?.status==="TRIAL_GENERATING") {
        await move(client,row,"TRIAL_GENERATION_FAILED","generation failed");
        await client.query(`UPDATE paid_setup_contexts SET failure_code='GENERATION_FAILED' WHERE learner_id=$1`,[id]);
        await client.query(`UPDATE generation_runs SET status='FAILED',error_code='GENERATION_FAILED',finished_at=now() WHERE scope_id=$1`,[scopeId]);
      }});
      if(error instanceof HttpError) throw error;
      throw new HttpError(503,"GENERATION_FAILED","Learning unit generation failed; retry is safe");
    }
    return this.read(id);
  }
  async openUnitTeaching(id:string,unitId:string){
    const provider=this.requireReasoning();
    const existing=await this.readUnitTeaching(id,unitId);if(existing)return existing;
    const claimed=await this.pool.query(`INSERT INTO unit_teaching_generations(learner_id,unit_id,status) SELECT $1,$2,'RUNNING' WHERE EXISTS(SELECT 1 FROM learning_units u JOIN learning_runway_units ru USING(unit_id) JOIN learning_runways r USING(runway_id) WHERE u.unit_id=$2 AND u.learner_id=$1 AND r.learner_id=$1) ON CONFLICT(unit_id) DO UPDATE SET status='RUNNING',error_code=NULL,started_at=now(),finished_at=NULL WHERE unit_teaching_generations.status='FAILED' RETURNING generation_id`,[id,unitId]);
    if(!claimed.rowCount){const saved=await this.readUnitTeaching(id,unitId);if(saved)return saved;throw new HttpError(409,"TEACHING_GENERATION_IN_PROGRESS","Teaching content is being generated; retry is safe");}
    try{
      const [unit,concepts,context,known]=await Promise.all([
        this.pool.query<any>(`SELECT unit_id "unitId",title,goal,prerequisites,product_context "productContext",grouping_reason "groupingReason",lab_outcome_placeholder "labOutcome" FROM learning_units WHERE unit_id=$1 AND learner_id=$2`,[unitId,id]),
        this.pool.query<any>(`SELECT c.concept_id "conceptId",c.external_key "conceptKey",c.name,c.short_example "shortExample",c.depth_category "depthCategory",uc.position FROM learning_unit_concepts uc JOIN concepts c USING(concept_id) JOIN learning_units u USING(unit_id) WHERE uc.unit_id=$1 AND u.learner_id=$2 ORDER BY uc.position`,[unitId,id]),
        this.pool.query<any>(`SELECT c.target_depth "targetDepth",c.target_path "targetPath",c.target_company "targetCompany",c.product_style "productStyle",g.target goal,p.role_title role FROM paid_setup_contexts c JOIN learner_goal_intents g USING(learner_id) JOIN learner_setup_profiles p USING(learner_id) WHERE c.learner_id=$1`,[id]),
        this.pool.query<any>(`SELECT c.name,s.relationship FROM learner_concept_state s JOIN concepts c USING(concept_id) WHERE s.learner_id=$1 AND s.relationship IN ('KNOWN_REPORTED','KNOWN_PROVEN')`,[id])
      ]);
      if(!unit.rows[0]||!concepts.rows.length)throw new HttpError(404,"UNIT_NOT_FOUND","Learning unit not found");
      const generated=await provider.generateUnitTeaching!({learnerId:id,targetDepth:context.rows[0]?.targetDepth??"STANDARD",unit:unit.rows[0],concepts:concepts.rows.map(c=>({key:c.conceptKey,name:c.name,shortExample:c.shortExample,depthCategory:c.depthCategory})),learnerContext:context.rows[0]??{},knownConcepts:known.rows});
      const expected=concepts.rows.map(c=>c.conceptKey);const actual=generated.value.lessons.map(l=>l.conceptKey);if(expected.length!==actual.length||expected.some((key,index)=>key!==actual[index]))throw new Error("INVALID_TEACHING_CONCEPT_COVERAGE");
      await withTransaction(this.pool,async client=>{for(const [position,lesson] of generated.value.lessons.entries()){const concept=concepts.rows[position];const saved=await client.query<{lessonId:string}>(`INSERT INTO concept_lessons(unit_id,concept_id,position,title,objective,recap) VALUES($1,$2,$3,$4,$5,$6::jsonb) RETURNING lesson_id "lessonId"`,[unitId,concept.conceptId,position,lesson.title,lesson.objective,JSON.stringify(lesson.recap)]);for(const [blockPosition,block] of lesson.blocks.entries())await client.query(`INSERT INTO lesson_content_blocks(lesson_id,position,block_type,title,body,items,language,code) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`,[saved.rows[0]!.lessonId,blockPosition,block.type,block.title,block.body,JSON.stringify(block.items),block.language,block.code]);}await client.query(`UPDATE unit_teaching_generations SET status='SUCCEEDED',introduction=$2,provider=$3,model=$4,response_id=$5,finished_at=now() WHERE unit_id=$1`,[unitId,generated.value.introduction,provider.provider,provider.model,generated.responseId]);});
      return (await this.readUnitTeaching(id,unitId))!;
    }catch(error){await this.pool.query(`UPDATE unit_teaching_generations SET status='FAILED',error_code='TEACHING_GENERATION_FAILED',finished_at=now() WHERE unit_id=$1 AND status='RUNNING'`,[unitId]);if(error instanceof HttpError)throw error;throw new HttpError(503,"TEACHING_GENERATION_FAILED","Teaching content could not be generated; retry is safe");}
  }
  async readUnitTeaching(id:string,unitId:string){
    const generation=await this.pool.query<{introduction:string}>(`SELECT introduction FROM unit_teaching_generations WHERE learner_id=$1 AND unit_id=$2 AND status='SUCCEEDED'`,[id,unitId]);if(!generation.rows[0])return null;
    const lessons=await this.pool.query<any>(`SELECT l.lesson_id "lessonId",l.concept_id "conceptId",c.name "conceptName",l.position,l.title,l.objective,l.recap,COALESCE(p.completed,false) completed,COALESCE(p.last_block_position,0) "lastBlockPosition" FROM concept_lessons l JOIN concepts c USING(concept_id) LEFT JOIN learner_lesson_progress p ON p.lesson_id=l.lesson_id AND p.learner_id=$1 WHERE l.unit_id=$2 ORDER BY l.position`,[id,unitId]);
    for(const lesson of lessons.rows)lesson.blocks=(await this.pool.query<any>(`SELECT block_id "blockId",position,block_type type,title,body,items,language,code FROM lesson_content_blocks WHERE lesson_id=$1 ORDER BY position`,[lesson.lessonId])).rows;
    return{unitId,introduction:generation.rows[0].introduction,generated:true as const,lessons:lessons.rows};
  }
  async saveLessonProgress(id:string,lessonId:string,input:{lastBlockPosition:number;completed:boolean}){const own=await this.pool.query(`SELECT 1 FROM concept_lessons l JOIN learning_units u USING(unit_id) WHERE l.lesson_id=$1 AND u.learner_id=$2`,[lessonId,id]);if(!own.rowCount)throw new HttpError(404,"LESSON_NOT_FOUND","Concept lesson not found");await this.pool.query(`INSERT INTO learner_lesson_progress(learner_id,lesson_id,last_block_position,completed,completed_at) VALUES($1,$2,$3,$4,CASE WHEN $4 THEN now() END) ON CONFLICT(learner_id,lesson_id) DO UPDATE SET last_block_position=GREATEST(learner_lesson_progress.last_block_position,$3),completed=learner_lesson_progress.completed OR $4,completed_at=CASE WHEN learner_lesson_progress.completed OR $4 THEN COALESCE(learner_lesson_progress.completed_at,now()) END,updated_at=now()`,[id,lessonId,input.lastBlockPosition,input.completed]);return{saved:true};}
  async readLearningUnits(id:string){
    return (await this.pool.query<any>(`SELECT u.unit_id "unitId",row_number() OVER(ORDER BY lr.created_at,ru.position)::int sequence,u.title,u.goal,ru.status,u.prerequisites,u.product_context "productContext",u.grouping_reason "groupingReason",u.lab_outcome_placeholder "labOutcomePlaceholder",
      COALESCE(jsonb_agg(jsonb_build_object('conceptId',c.concept_id,'name',c.name) ORDER BY uc.position) FILTER(WHERE c.concept_id IS NOT NULL),'[]') concepts
      FROM learning_runway_units ru JOIN learning_runways lr USING(runway_id) JOIN learning_units u USING(unit_id) LEFT JOIN learning_unit_concepts uc USING(unit_id) LEFT JOIN concepts c USING(concept_id)
      WHERE lr.learner_id=$1 AND u.learner_id=$1 GROUP BY u.unit_id,lr.created_at,ru.position,ru.status ORDER BY lr.created_at,ru.position`,[id])).rows;
  }
  async read(id:string) {
    const context=await this.pool.query<ContextRow>(`SELECT learner_id "learnerId",goal_id "goalId",revision,status,jd_text "jdText",target_company "targetCompany",product_style "productStyle",target_depth "targetDepth",failure_code "failureCode",target_path "targetPath" FROM paid_setup_contexts WHERE learner_id=$1`,[id]);
    if(!context.rows[0]) throw new HttpError(404,"SETUP_NOT_STARTED","Start paid setup first"); const c=context.rows[0];
    const base=await this.pool.query<any>(`SELECT p.role_title role,g.target goal,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('name',s.name,'level',s.level,'source',s.source) ORDER BY s.position) FROM learner_skill_assessments s WHERE s.learner_id=$1),'[]') skills,
      COALESCE((SELECT jsonb_agg(interest ORDER BY position) FROM learner_interests WHERE learner_id=$1),'[]') interests,
      lp.timeline_days "timelineDays",lp.pace FROM learner_setup_profiles p JOIN learner_goal_intents g USING(learner_id) JOIN learner_learning_preferences lp USING(learner_id) WHERE p.learner_id=$1`,[id]);
    const requirements=await this.pool.query<any>(`SELECT name,classification,reason,source FROM target_requirements WHERE learner_id=$1 ORDER BY position`,[id]);
    const concepts=await this.pool.query<any>(`SELECT cap.capability_id "capabilityId",cap.name "capabilityName",cap.tab,cap.reason,cap.scenario,
      c.concept_id "conceptId",c.name,c.short_example "shortExample",c.depth_category "depthCategory",c.requirement_class "requirementClass",c.recommendation_reason "recommendationReason",s.relationship,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('conceptId',pc.concept_id,'name',pc.name) ORDER BY pc.name) FROM concept_dependencies d JOIN concepts pc ON pc.concept_id=d.prerequisite_concept_id WHERE d.concept_id=c.concept_id),'[]') prerequisites,
      COALESCE(i.selected,false) selected FROM learner_concept_state s JOIN concepts c USING(concept_id) JOIN capabilities cap USING(capability_id)
      LEFT JOIN learning_scopes sc ON sc.learner_id=s.learner_id AND sc.revision=(SELECT max(revision) FROM learning_scopes WHERE learner_id=$1)
      LEFT JOIN learning_scope_items i ON i.scope_id=sc.scope_id AND i.concept_id=c.concept_id WHERE s.learner_id=$1 AND c.origin='AI_GENERATED' AND cap.origin='AI_GENERATED' AND cap.learner_id=$1 ORDER BY cap.position,c.position`,[id]);
    const map:any[]=[]; for(const x of concepts.rows){if(!x.recommendationReason) throw new Error(`Missing contextual recommendation reason for ${x.conceptId}`);let cap=map.find(y=>y.capabilityId===x.capabilityId);if(!cap){cap={capabilityId:x.capabilityId,name:x.capabilityName,tab:x.tab,reason:x.reason,scenario:x.scenario,concepts:[]};map.push(cap);}cap.concepts.push({conceptId:x.conceptId,name:x.name,shortExample:x.shortExample,status:["KNOWN_REPORTED","KNOWN_PROVEN"].includes(x.relationship)?"KNOWN":x.relationship==="DEEPER_OPTIONAL"?"DEEP":"RECOMMENDED",relationship:x.relationship,recommendationReason:x.recommendationReason,selected:x.selected,depthCategory:x.depthCategory,requirementClass:x.requirementClass,prerequisites:x.prerequisites});}
    const units=await this.pool.query<any>(`SELECT u.unit_id "unitId",u.sequence,u.title,u.goal,ru.status,u.prerequisites,u.product_context "productContext",u.grouping_reason "groupingReason",u.lab_outcome_placeholder "labOutcomePlaceholder",
      COALESCE(jsonb_agg(jsonb_build_object('conceptId',c.concept_id,'name',c.name) ORDER BY uc.position) FILTER(WHERE c.concept_id IS NOT NULL),'[]') concepts
      FROM learning_units u JOIN learning_runway_units ru USING(unit_id) LEFT JOIN learning_unit_concepts uc USING(unit_id) LEFT JOIN concepts c USING(concept_id)
      WHERE u.learner_id=$1 AND ru.runway_id=(SELECT runway_id FROM learning_runways WHERE learner_id=$1 AND commercial_product_key='TRY_IT' ORDER BY created_at LIMIT 1)
      GROUP BY u.unit_id,ru.status ORDER BY u.sequence`,[id]);
    const b=base.rows[0]!;
    return paidSetupStateSchema.parse({learnerId:id,goalId:c.goalId,revision:c.revision,status:c.status,context:{targetPath:c.targetPath,targetDepth:c.targetDepth,role:b.role,goal:b.goal,skills:b.skills,interests:b.interests,timelineDays:b.timelineDays,pace:b.pace,jdText:c.jdText,targetCompany:c.targetCompany,productStyle:c.productStyle},requirements:requirements.rows,learningMap:map,units:units.rows,failureCode:c.failureCode});
  }
}
