import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes,randomUUID } from "node:crypto";
import { createDatabase,migrate } from "../dist/index.js";
import { createApp } from "../../../services/api/dist/src/app.js";
import { LearningSetupService } from "../../../services/api/dist/src/learning/service.js";
import { loadConfig,requireDatabaseUrl } from "../../../services/api/dist/src/config.js";
import { paidSetupStateSchema } from "@adaptive-labs/contracts";

let labGenerations=0;
const reasoning={provider:"TEST",model:"test-reasoner",
  async extractResumeSkills(){return [];},
  async propose(input){return {responseId:"proposal-test",value:{targetPath:"BACKEND_ENGINEER",requirements:[{name:input.goal,classification:"REQUIRED",reason:"Learner goal",source:"GOAL"},...(input.jdText?[{name:"JD expectations",classification:"USEFUL",reason:"Optional JD",source:"JD"}]:[])],capabilities:[
    {key:"api",name:"API Design",tab:"Core Backend",reason:"API foundation",scenario:"Build an API",concepts:[
      {key:"http-contracts",name:"HTTP contracts",shortExample:"Version a JSON API",relationship:"RECOMMENDED_NEXT",recommendationReason:"Required foundation",selected:false,depthCategory:"FOUNDATION",requirementClass:"REQUIRED",aliases:["REST APIs"],prerequisites:[]},
      {key:"request-validation",name:"Request validation",shortExample:"Reject malformed input",relationship:"RECOMMENDED_NEXT",recommendationReason:"Protect boundaries",selected:true,depthCategory:"APPLIED",requirementClass:"REQUIRED",aliases:["validation"],prerequisites:["http-contracts"]}]},
    {key:"data",name:"Data Reliability",tab:"Reliability & Scale",reason:"Reliable persistence",scenario:"Persist consistent state",concepts:[
      {key:"relational-modeling",name:"PostgreSQL",shortExample:"Model relational data",relationship:"KNOWN_REPORTED",recommendationReason:"Matches profile",selected:false,depthCategory:"FOUNDATION",requirementClass:"REQUIRED",aliases:["postgres"],prerequisites:[]},
      {key:"transactions",name:"Transactions",shortExample:"Commit atomically",relationship:"RECOMMENDED_NEXT",recommendationReason:"Reliable writes",selected:true,depthCategory:"APPLIED",requirementClass:"REQUIRED",aliases:[],prerequisites:["relational-modeling"]},
      {key:"caching",name:"Caching",shortExample:"Cache safe reads",relationship:"DEEPER_OPTIONAL",recommendationReason:"Optional depth",selected:false,depthCategory:"DEEP",requirementClass:"OPTIONAL",aliases:[],prerequisites:[]}]}]}};},
  async generateUnits(input){const keys=input.capabilities.flatMap(x=>x.concepts.map(c=>c.key)),cut=Math.ceil(keys.length/2);return {responseId:"units-test",value:{units:[{sequence:1,title:"Foundations",goal:"Build foundations",conceptKeys:keys.slice(0,cut),prerequisiteNames:[],productContext:"Learner context",groupingReason:"Foundations first",futureLabOutcome:"Build an API"},{sequence:2,title:"Reliable systems",goal:"Build reliable systems",conceptKeys:keys.slice(cut),prerequisiteNames:["Unit 1"],productContext:"Learner context",groupingReason:"Dependent work second",futureLabOutcome:"Build reliable writes"}]}};}
  ,async generateUnitTeaching(input){return {responseId:"teaching-test",value:{introduction:"A personalized introduction",lessons:input.concepts.map(c=>({conceptKey:c.key,title:c.name,objective:`Understand and apply ${c.name}`,blocks:[{type:"TEXT",language:"",code:"",title:"Plain explanation",body:`An explanation of ${c.name}`,items:[]},{type:"TEXT",language:"",code:"",title:"Why it matters",body:"It supports the learner goal",items:[]},{type:"BULLETS",language:"",code:"",title:"Technical detail",body:"Important implementation details",items:[]},{type:"CODE",language:"typescript",code:"// Bound waiting so an unavailable dependency cannot stall checkout.\nawait fetch(url, { signal: AbortSignal.timeout(1000) });",title:"Worked example",body:"A bounded request",items:["The timeout protects response latency."]}],recap:["Core idea","Practical use"]}))}};}
  ,async generateDoubtClarification(){return {responseId:"clarification-test",value:{explanation:"A focused clarification based on the completed lab.",recap:["Review the core rule","Apply it in the next example"]}};}
  ,async generateLab(){labGenerations++;return {responseId:"lab-test",value:{overview:"Practice the current unit",goal:"Demonstrate the target capability",evaluationCriteria:["Learner file is complete"],files:[{path:"generated.ts",role:"YOU_BUILD",content:"",humanMeaning:"Your implementation",technicalRole:"Target responsibility",inputOutput:"Input to evaluated output",learningPurpose:"Practice and demonstrate the unit"},{path:"checks.test.ts",role:"TEST",content:"// generated checks",humanMeaning:"Automated checks",technicalRole:"Validation",inputOutput:"Implementation to results",learningPurpose:"Verify the work"}]}};}
  ,async generateLabHint(input){return {responseId:`hint-${input.hintNumber}`,text:input.hintNumber===1?"Trace the required outcome before changing code.":"Separate the operation into validation, execution and verification steps."};}
  ,async generateGlossaryMeaning(input){return {responseId:"glossary-test",simpleMeaning:`Simple meaning of ${input.selectedText}`,technicalMeaning:`Technical meaning of ${input.selectedText}`};}
  ,async generateSystemAssistance(){return {responseId:"assistance-test",content:"A completed example and explanation."};}
  ,async analyzeContinuation(input){const names=input.conceptState.filter(item=>item.relationship!=="KNOWN_PROVEN").map(item=>item.name);return {responseId:"continuation-test",value:{remainingRequirements:["Production operation"],remainingCapabilityGaps:["Observability"],prerequisiteDependencies:["Deployment after observability"],noTeachingNeeded:["HTTP contracts"],repairConcepts:[],mergeIntoFutureLabs:["Retries"],plannedUnits:3,plannedLabs:3,proposedUnits:[1,2,3].map((n,index)=>({title:`Next ${n}`,goal:`Goal ${n}`,conceptNames:[names[index%names.length]],prerequisites:n===1?[]:[`Next ${n-1}`],productContext:"Learner context",futureLabOutcome:`Lab ${n}`}))}};}
};

test("Layer 3 paid setup, scope and exactly two unit definitions",{timeout:120000},async t=>{
  const admin=createDatabase(requireDatabaseUrl(loadConfig()));
  const schema="layer3_"+randomUUID().replaceAll("-",""); await admin.query('CREATE SCHEMA "'+schema+'"');
  const url=new URL(requireDatabaseUrl(loadConfig()));url.searchParams.set("options","-c search_path="+schema+",public");
  const pool=createDatabase(url.toString());await migrate(pool);
  const entitlement="adaptive_labs_pro";
  const config=loadConfig({DATABASE_URL:url.toString(),AUTH_SECRET:randomBytes(32).toString("hex"),REVENUECAT_ENTITLEMENT_ID:entitlement,LOG_LEVEL:"silent"});
  let app=createApp(config,{learningReasoning:reasoning});await app.ready();
  t.after(async()=>{await app.close();await pool.end();await admin.query('DROP SCHEMA "'+schema+'" CASCADE');await admin.end();});
  let ip=1;
  async function call(method,path,payload,token,expected=200){const response=await app.inject({method,url:path,...(payload===undefined?{}:{payload}),headers:token?{authorization:"Bearer "+token}:{},remoteAddress:"203.0.113."+(ip++)});assert.equal(response.statusCode,expected,response.body);return response.json();}
  async function learner(email,paid=true){
    const session=await call("POST","/auth/signup",{email,password:randomBytes(20).toString("hex")},null,201);
    await pool.query(`UPDATE learners SET display_name='Layer Three' WHERE learner_id=$1`,[session.learnerId]);
    await pool.query(`UPDATE learner_setup_profiles SET role_title='Backend Engineer',experience_years=2 WHERE learner_id=$1`,[session.learnerId]);
    await pool.query(`INSERT INTO learner_goal_intents(learner_id,target,reason) VALUES($1,'Build reliable backend products','career')`,[session.learnerId]);
    await pool.query(`INSERT INTO learner_interests VALUES($1,'SaaS',0)`,[session.learnerId]);
    await pool.query(`UPDATE learner_learning_preferences SET timeline_days=180,pace='STEADY' WHERE learner_id=$1`,[session.learnerId]);
    await pool.query(`INSERT INTO learner_skill_assessments(learner_id,name,source,level,position) VALUES($1,'PostgreSQL','CV_CONFIRMED','WORKING',0),($1,'Docker','MANUAL','AWARE',1)`,[session.learnerId]);
    await pool.query(`UPDATE onboarding_states SET current_step='complete',completed=true,completed_at=now() WHERE learner_id=$1`,[session.learnerId]);
    await pool.query(`INSERT INTO learner_trial_states(learner_id) VALUES($1)`,[session.learnerId]);
    if(paid){await pool.query(`INSERT INTO learner_entitlements(learner_id,entitlement_key,status,latest_event_timestamp_ms) VALUES($1,$2,'ACTIVE',1)`,[session.learnerId,entitlement]);await pool.query(`UPDATE learner_trial_states SET status='ACTIVE_SETUP_PENDING',activated_at=now() WHERE learner_id=$1`,[session.learnerId]);}
    return session;
  }
  const unpaid=await learner("layer3-unpaid@example.com",false);
  await call("POST","/me/paid-setup/start",{},unpaid.token,403);
  await call("POST","/me/paid-setup/jd-document",{filename:"role.txt",mimeType:"text/plain",contentBase64:Buffer.from("Backend role").toString("base64")},unpaid.token,403);

  const first=await learner("layer3-paid@example.com");
  let state=paidSetupStateSchema.parse(await call("POST","/me/paid-setup/start",{},first.token));
  assert.equal(state.status,"TRIAL_PAID_SETUP_PENDING");
  const again=await call("POST","/me/paid-setup/start",{},first.token);assert.equal(again.revision,state.revision);
  const jdText="Design PostgreSQL APIs with authentication, transactions, retries and observability";
  const jd=await call("POST","/me/paid-setup/jd-document",{filename:"role.txt",mimeType:"text/plain",contentBase64:Buffer.from(jdText).toString("base64")},first.token);
  assert.equal(jd.text,jdText);assert.equal(jd.filename,"role.txt");
  state=paidSetupStateSchema.parse(await call("PUT","/me/paid-setup/context",{revision:state.revision,jdText:jd.text,targetCompany:"Example Co",productStyle:"B2B SaaS",targetDepth:"DEEP"},first.token));
  state=paidSetupStateSchema.parse(await call("POST","/me/learning-scope/propose",{revision:state.revision},first.token));
  assert.ok(state.requirements.some(x=>x.source==="JD"));
  assert.equal(state.status,"TRIAL_SCOPE_PROPOSED");
  const http=state.learningMap.flatMap(x=>x.concepts).find(x=>x.name==="HTTP contracts");
  assert.equal(http.selected,true,"default proposal closes the dependency required by Request validation");
  const validation=state.learningMap.flatMap(x=>x.concepts).find(x=>x.name==="Request validation");
  assert.deepEqual(validation.prerequisites.map(x=>x.name),["HTTP contracts"]);
  const relational=state.learningMap.flatMap(x=>x.concepts).find(x=>x.name==="PostgreSQL");
  assert.equal(relational.status,"KNOWN");assert.equal(relational.selected,false);assert.equal(relational.relationship,"KNOWN_REPORTED");
  const deep=state.learningMap.flatMap(x=>x.concepts).find(x=>x.name==="Caching");assert.equal(deep.status,"DEEP");
  state=paidSetupStateSchema.parse(await call("PUT","/me/learning-scope",{revision:state.revision,items:[{conceptId:http.conceptId,selected:false}]},first.token));
  await call("POST","/me/learning-scope/confirm",{revision:state.revision},first.token,422);
  state=paidSetupStateSchema.parse(await call("PUT","/me/learning-scope",{revision:state.revision,items:[{conceptId:http.conceptId,selected:true}]},first.token));
  state=paidSetupStateSchema.parse(await call("PUT","/me/learning-scope",{revision:state.revision,items:[{conceptId:deep.conceptId,selected:true}]},first.token));
  assert.equal(state.learningMap.flatMap(x=>x.concepts).find(x=>x.conceptId===deep.conceptId).selected,true);
  await call("PUT","/me/learning-scope",{revision:state.revision,items:[{conceptId:relational.conceptId,selected:true}]},first.token,422);
  state=paidSetupStateSchema.parse(await call("POST","/me/learning-scope/confirm",{revision:state.revision},first.token));
  assert.equal(state.status,"TRIAL_SCOPE_CONFIRMED");
  state=paidSetupStateSchema.parse(await call("POST","/me/learning-units/generate",{revision:state.revision},first.token));
  assert.equal(state.status,"TRIAL_READY");assert.equal(state.units.length,2);assert.deepEqual(state.units.map(x=>x.sequence),[1,2]);
  assert.equal((await pool.query(`SELECT status FROM learner_trial_states WHERE learner_id=$1`,[first.learnerId])).rows[0].status,"ACTIVE");
  const unitConcepts=state.units.flatMap(x=>x.concepts.map(c=>c.conceptId));assert.equal(unitConcepts.includes(relational.conceptId),false);
  const retried=await call("POST","/me/learning-units/generate",{revision:state.revision},first.token);assert.equal(retried.units.length,2);
  let continuation=await call("GET","/me/learning-continuation",undefined,first.token);assert.equal(continuation.commercialProductKey,"TRY_IT");assert.equal(continuation.nextAction,"CONTINUE_LEARNING");
  const firstUnit=state.units[0],secondUnit=state.units[1];
  await call("POST","/me/learning-notes",{sourceType:"UNIT",sourceId:firstUnit.unitId,unitId:firstUnit.unitId,conceptId:null,labId:null,fileId:null,selectedText:null,attachmentType:"UNIT",attachmentRef:null,body:"My private note"},first.token);
  assert.equal((await call("GET","/me/learning-notes?q=private",undefined,first.token)).length,1);
  assert.equal((await call("GET","/me/learning-notes",undefined,unpaid.token)).length,0);
  await call("POST","/me/learning-markers",{sourceType:"SENTENCE",sourceId:firstUnit.unitId,unitId:firstUnit.unitId,conceptId:null,labId:null,selectedText:"Familiar",markerType:"I_KNOW_THIS"},first.token);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM lab_evidence e JOIN lab_attempts a USING(attempt_id) WHERE a.learner_id=$1`,[first.learnerId])).rows[0].n,0);
  continuation=await call("GET","/me/learning-continuation",undefined,first.token);assert.equal(continuation.commercialProductKey,"TRY_IT");
  const prerequisiteConcept=firstUnit.concepts.find(c=>c.name==="HTTP contracts")??firstUnit.concepts[0];
  const word=await call("POST","/me/marked-words",{sourceType:"WORD",sourceId:prerequisiteConcept.conceptId,unitId:firstUnit.unitId,conceptId:prerequisiteConcept.conceptId,labId:null,selectedText:prerequisiteConcept.name,sourceContext:firstUnit.goal,learnerStatus:"GO_DEEPER"},first.token);assert.ok(word.markedWordId);assert.equal((await call("GET","/me/marked-words",undefined,first.token)).length,1);
  const doubt=await call("POST","/me/learning-markers",{sourceType:"CONCEPT_SECTION",sourceId:prerequisiteConcept.conceptId,unitId:firstUnit.unitId,conceptId:prerequisiteConcept.conceptId,labId:null,selectedText:"I do not understand this prerequisite",markerType:"DONT_UNDERSTAND"},first.token);
  async function finishTeaching(unit){const teaching=await call("POST",`/me/learning-units/${unit.unitId}/teaching/open`,{},first.token);assert.equal(teaching.lessons.length,unit.concepts.length);assert.equal(teaching.lessons[0].blocks[3].language,"typescript");assert.match(teaching.lessons[0].blocks[3].code,/AbortSignal.timeout/);const reopened=await call("POST",`/me/learning-units/${unit.unitId}/teaching/open`,{},first.token);assert.deepEqual(reopened,teaching);for(const lesson of teaching.lessons)await call("PUT",`/me/concept-lessons/${lesson.lessonId}/progress`,{lastBlockPosition:lesson.blocks.length,completed:true},first.token);return teaching;}
  await call("POST",`/me/learning-units/${firstUnit.unitId}/complete`,{},first.token,409);
  await finishTeaching(firstUnit);
  let checkpoint;const generationCount=labGenerations;const completions=await Promise.all([call("POST",`/me/learning-units/${firstUnit.unitId}/complete`,{},first.token),call("POST",`/me/learning-units/${firstUnit.unitId}/complete`,{},first.token)]);checkpoint=completions[0];assert.equal(completions[0].labId,completions[1].labId);assert.equal(labGenerations,generationCount+1);assert.equal(checkpoint.checkpoint,"LAB_READY");
  let firstLab=(await pool.query(`SELECT lab_id FROM labs WHERE learner_id=$1 AND unit_id=$2`,[first.learnerId,firstUnit.unitId])).rows[0].lab_id;
  const file=(await pool.query(`SELECT lab_file_id FROM lab_files WHERE lab_id=$1 AND role='YOU_BUILD' LIMIT 1`,[firstLab])).rows[0];assert.ok(file);
  await call("GET",`/me/labs/${firstLab}`,undefined,unpaid.token,404);
  let attempt=await call("POST",`/me/labs/${firstLab}/start`,{},first.token);await call("POST","/me/labs/hints",{attemptId:randomUUID(),fileId:file.lab_file_id},first.token,404);await call("POST","/me/labs/system-assistance",{attemptId:attempt.attemptId},first.token,409);let hint=await call("POST","/me/labs/hints",{attemptId:attempt.attemptId,fileId:file.lab_file_id},first.token);assert.equal(hint.hintsRemaining,1);assert.equal(hint.fileId,file.lab_file_id);hint=await call("POST","/me/labs/hints",{attemptId:attempt.attemptId,fileId:file.lab_file_id},first.token);assert.equal(hint.hintsRemaining,0);const labWithHints=await call("GET",`/me/labs/${firstLab}`,undefined,first.token);assert.equal(labWithHints.hints.length,2);assert.ok(labWithHints.hints.every(item=>item.fileId===file.lab_file_id));await call("POST","/me/labs/hints",{attemptId:attempt.attemptId,fileId:file.lab_file_id},first.token,409);
  await call("POST","/me/labs/evidence",{attemptId:attempt.attemptId,conceptId:prerequisiteConcept.conceptId,assistanceLevel:"SYSTEM_ASSISTED",outcome:"DEMONSTRATED",details:{}},first.token,422);
  await call("PUT","/me/labs/draft",{attemptId:attempt.attemptId,fileId:file.lab_file_id,content:"export const solution = true;",version:1},first.token);const beforeReopen=await call("GET",`/me/labs/${firstLab}`,undefined,first.token);const generatedCount=labGenerations;await call("POST",`/me/learning-units/${firstUnit.unitId}/complete`,{},first.token);const reopenedLab=await call("GET",`/me/labs/${firstLab}`,undefined,first.token);assert.deepEqual(reopenedLab,beforeReopen);assert.equal(reopenedLab.unitId,firstUnit.unitId);assert.equal(reopenedLab.status,"IN_PROGRESS");assert.equal(reopenedLab.hintsUsed,2);assert.equal(reopenedLab.files.find(f=>f.fileId===file.lab_file_id).draft,"export const solution = true;");assert.equal(labGenerations,generatedCount);assert.equal((await call("POST","/me/labs/run",{attemptId:attempt.attemptId},first.token)).status,"PASSED");const submitted=await call("POST","/me/labs/submit",{attemptId:attempt.attemptId},first.token);assert.equal(submitted.passed,true);
  continuation=await call("GET","/me/learning-continuation",undefined,first.token);assert.equal(continuation.nextAction,"DOUBT_CLEARANCE");await call("POST",`/me/learning-doubts/${doubt.doubtId}/resolve`,{},first.token);
  await call("POST","/me/learning-markers",{sourceType:"CONCEPT_SECTION",sourceId:secondUnit.concepts[0].conceptId,unitId:secondUnit.unitId,conceptId:secondUnit.concepts[0].conceptId,labId:null,selectedText:"Explore this more deeply",markerType:"GO_DEEPER"},first.token);
  const mergeDoubt=await call("POST","/me/learning-markers",{sourceType:"SENTENCE",sourceId:secondUnit.unitId,unitId:secondUnit.unitId,conceptId:null,labId:null,selectedText:"I need theory clarification after practice",markerType:"DONT_UNDERSTAND"},first.token);
  await finishTeaching(secondUnit);checkpoint=await call("POST",`/me/learning-units/${secondUnit.unitId}/complete`,{},first.token);assert.equal(checkpoint.checkpoint,"LAB_READY");const secondLab=(await pool.query(`SELECT lab_id FROM labs WHERE learner_id=$1 AND unit_id=$2`,[first.learnerId,secondUnit.unitId])).rows[0];attempt=await call("POST",`/me/labs/${secondLab.lab_id}/start`,{},first.token);await call("POST",`/me/labs/${secondLab.lab_id}/complete`,{},first.token);continuation=await call("GET","/me/learning-continuation",undefined,first.token);assert.equal(continuation.nextAction,"DOUBT_CLEARANCE");await call("POST",`/me/learning-doubts/${mergeDoubt.doubtId}/resolve`,{},first.token);const deferred=(await pool.query(`SELECT doubt_id FROM learner_doubts WHERE learner_id=$1 AND source_unit_id=$2 AND status='DEFERRED'`,[first.learnerId,secondUnit.unitId])).rows;assert.equal(deferred.length,1,"deeper doubts remain deferred for the next runway");continuation=await call("GET","/me/learning-continuation",undefined,first.token);assert.equal(continuation.nextAction,"REVIEW_NEXT_RUNWAY");
  assert.equal((await pool.query(`SELECT count(*)::int n FROM unit_teaching_generations WHERE learner_id=$1 AND status='SUCCEEDED'`,[first.learnerId])).rows[0].n,2);
  await app.close();app=createApp(config,{learningReasoning:reasoning});await app.ready();assert.equal((await call("GET","/me/paid-setup",undefined,first.token)).units.length,2);

  const second=await learner("layer3-retry@example.com");
  let b=await call("POST","/me/paid-setup/start",{},second.token);
  b=await call("PUT","/me/paid-setup/context",{revision:b.revision,jdText:null,targetCompany:null,productStyle:null,targetDepth:"STANDARD"},second.token);
  assert.equal(b.requirements.some(x=>x.source==="JD"),false);
  b=await call("POST","/me/learning-scope/propose",{revision:b.revision},second.token);
  b=await call("POST","/me/learning-scope/confirm",{revision:b.revision},second.token);
  const service=new LearningSetupService(pool,entitlement,reasoning);
  await assert.rejects(()=>service.generate(second.learnerId,b.revision,true),/Learning unit generation failed/);
  b=await service.read(second.learnerId);assert.equal(b.status,"TRIAL_GENERATION_FAILED");assert.equal(b.units.length,0);
  b=await service.generate(second.learnerId,b.revision);assert.equal(b.status,"TRIAL_READY");assert.equal(b.units.length,2);
  assert.ok((await pool.query(`SELECT count(*)::int n FROM paid_setup_state_events WHERE learner_id=$1`,[second.learnerId])).rows[0].n>=6);
});

