import assert from "node:assert/strict";
import test from "node:test";
import { OpenAILearningReasoningProvider,ReasoningProviderError,generatedLabSchema,generatedUnitTeachingSchema,proposalSchema,unitsPlanSchema } from "../src/learning/reasoning.js";
import { classifyRunway } from "../src/continuation/service.js";
import { closePrerequisiteSelection,selectTrialRunwayConcepts } from "../src/learning/service.js";

test("dynamic proposal accepts an unmapped model-proposed concept",()=>{
  const parsed=proposalSchema.parse({targetPath:"AI_APPLICATION_ENGINEER",requirements:[{name:"Build AI products",classification:"REQUIRED",reason:"Learner goal",source:"GOAL"}],capabilities:[
    {key:"model-integration",name:"Model integration",tab:"AI Application Foundations",reason:"Needed for the goal",scenario:"Connect a product to a model",concepts:[{key:"novel-provider-routing",name:"Novel provider routing",shortExample:"Route requests by capability",relationship:"RECOMMENDED_NEXT",recommendationReason:"Useful for this learner",selected:true,depthCategory:"APPLIED",requirementClass:"USEFUL",aliases:[],prerequisites:[]}]},
    {key:"evaluation",name:"Evaluation",tab:"Quality & Safety",reason:"Measure quality",scenario:"Evaluate a generated answer",concepts:[{key:"task-evals",name:"Task evaluations",shortExample:"Score a task outcome",relationship:"RECOMMENDED_NEXT",recommendationReason:"Required for reliable products",selected:true,depthCategory:"APPLIED",requirementClass:"REQUIRED",aliases:["evals"],prerequisites:["novel-provider-routing"]}]},
  ]});
  assert.equal(parsed.capabilities[0]!.concepts[0]!.key,"novel-provider-routing");
});

test("unit reasoning contract requires exactly two ordered units",()=>{
  const unit={sequence:1 as const,title:"One",goal:"Learn one",conceptKeys:["one"],prerequisiteNames:[],productContext:"SaaS",groupingReason:"Foundation",futureLabOutcome:"Build one"};
  assert.equal(unitsPlanSchema.safeParse({units:[unit]}).success,false);
  assert.equal(unitsPlanSchema.safeParse({units:[unit,{...unit,sequence:2,title:"Two",conceptKeys:["two"]}]}).success,true);
});

test("proposal rejects generic learner-facing recommendation explanations",()=>{
  const result=proposalSchema.safeParse({targetPath:"AI_APPLICATION_ENGINEER",requirements:[{name:"Build AI products",classification:"REQUIRED",reason:"Learner goal",source:"GOAL"}],capabilities:[
    {key:"one",name:"One",tab:"Core",reason:"Role requirement",scenario:"Apply one",concepts:[{key:"concept-one",name:"Concept one",shortExample:"Apply concept one",relationship:"KNOWN_REPORTED",recommendationReason:"Matches a learner-confirmed skill",selected:false,depthCategory:"FOUNDATION",requirementClass:"REQUIRED",aliases:[],prerequisites:[]}]},
    {key:"two",name:"Two",tab:"Core",reason:"Role requirement",scenario:"Apply two",concepts:[{key:"concept-two",name:"Concept two",shortExample:"Apply concept two",relationship:"RECOMMENDED_NEXT",recommendationReason:"Recommended by the reasoning engine",selected:true,depthCategory:"APPLIED",requirementClass:"USEFUL",aliases:[],prerequisites:[]}]},
  ]});
  assert.equal(result.success,false);
});

test("commercial runway classification depends only on planned unit count",()=>{
  assert.equal(classifyRunway(1),"FOCUS");assert.equal(classifyRunway(3),"FOCUS");
  assert.equal(classifyRunway(4),"GROWTH");assert.equal(classifyRunway(6),"GROWTH");
  assert.equal(classifyRunway(7),"DEEP");assert.equal(classifyRunway(20),"DEEP");
  assert.throws(()=>classifyRunway(0));
});

const providerInput={learnerId:"learner-test",goal:"Backend engineer",role:null,experienceYears:0,skills:[],interests:[],timelineDays:180,pace:"STEADY",jdText:"Backend role",targetCompany:"Example",productStyle:"Fintech"};
const providerProposal={targetPath:"BACKEND_ENGINEER",requirements:[{name:"Backend delivery",classification:"REQUIRED",reason:"The target role requires reliable server-side delivery",source:"GOAL"}],capabilities:[
  {key:"api-foundations",name:"API foundations",tab:"Backend",reason:"Closes the learner's API design gap",scenario:"Design an endpoint",concepts:[{key:"http-contracts",name:"HTTP contracts",shortExample:"Define request and response behavior",relationship:"RECOMMENDED_NEXT",recommendationReason:"This foundation supports the learner's backend target role",selected:true,depthCategory:"FOUNDATION",requirementClass:"REQUIRED",aliases:[],prerequisites:[]}]},
  {key:"data-reliability",name:"Data reliability",tab:"Backend",reason:"Supports the supplied product context",scenario:"Persist a safe update",concepts:[{key:"atomic-updates",name:"Atomic updates",shortExample:"Commit related writes together",relationship:"RECOMMENDED_NEXT",recommendationReason:"Fintech work needs consistent updates when operations fail",selected:true,depthCategory:"APPLIED",requirementClass:"REQUIRED",aliases:[],prerequisites:["http-contracts"]}]},
]};
const completed=(value:unknown)=>new Response(JSON.stringify({id:"resp_test",status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(value)}]}]}),{status:200,headers:{"content-type":"application/json"}});

test("OpenAI reasoning retries a transient 5xx once and validates structured output",async()=>{
  let calls=0;const events:Record<string,unknown>[]=[];
  const provider=new OpenAILearningReasoningProvider("test-key-that-is-long-enough","gpt-test",{maxRetries:1,timeoutMs:10_000,sleep:async()=>{},log:(_level,event)=>events.push(event),fetchImpl:async()=>++calls===1?new Response(JSON.stringify({error:{code:"server_error"}}),{status:500}):completed(providerProposal)});
  const result=await provider.propose(providerInput);
  assert.equal(calls,2);assert.equal(result.value.targetPath,"BACKEND_ENGINEER");
  assert.ok(events.some(event=>event.category==="OPENAI_5XX"&&event.willRetry===true));
  assert.ok(events.some(event=>event.stage==="structured_output_validated"&&event.validationSucceeded===true));
});

test("OpenAI reasoning does not retry invalid structured output",async()=>{
  let calls=0;const provider=new OpenAILearningReasoningProvider("test-key-that-is-long-enough","gpt-test",{maxRetries:2,timeoutMs:10_000,sleep:async()=>{},fetchImpl:async()=>{calls++;return completed({...providerProposal,capabilities:[]});}});
  await assert.rejects(provider.propose(providerInput),(error:unknown)=>error instanceof ReasoningProviderError&&error.category==="SCHEMA_VALIDATION_FAILURE");
  assert.equal(calls,1);
});

test("OpenAI reasoning reports retry exhaustion with the underlying timeout category",async()=>{
  const provider=new OpenAILearningReasoningProvider("test-key-that-is-long-enough","gpt-test",{maxRetries:1,timeoutMs:10_000,sleep:async()=>{},fetchImpl:async()=>{throw new DOMException("timed out","TimeoutError");}});
  await assert.rejects(provider.propose(providerInput),(error:unknown)=>error instanceof ReasoningProviderError&&error.category==="RETRY_EXHAUSTED"&&error.details.causeCategory==="PROVIDER_TIMEOUT");
});

test("recommended dependent concept automatically includes its prerequisite",()=>{
  assert.deepEqual([...closePrerequisiteSelection([{key:"foundation",selected:false,satisfied:false,prerequisites:[]},{key:"dependent",selected:true,satisfied:false,prerequisites:["foundation"]}])].sort(),["dependent","foundation"]);
});

test("multi-level prerequisite chains close transitively",()=>{
  assert.deepEqual([...closePrerequisiteSelection([{key:"a",selected:false,satisfied:false,prerequisites:[]},{key:"b",selected:false,satisfied:false,prerequisites:["a"]},{key:"c",selected:true,satisfied:false,prerequisites:["b"]}])].sort(),["a","b","c"]);
});

test("known proven prerequisites are not redundantly selected",()=>{
  assert.deepEqual([...closePrerequisiteSelection([{key:"known",selected:false,satisfied:true,prerequisites:[]},{key:"dependent",selected:true,satisfied:false,prerequisites:["known"]}])],["dependent"]);
});

test("duplicate prerequisite edges do not duplicate selection",()=>{
  assert.deepEqual([...closePrerequisiteSelection([{key:"a",selected:false,satisfied:false,prerequisites:[]},{key:"b",selected:true,satisfied:false,prerequisites:["a","a"]}])].sort(),["a","b"]);
});

test("dependency cycles terminate and include each concept once",()=>{
  assert.deepEqual([...closePrerequisiteSelection([{key:"a",selected:true,satisfied:false,prerequisites:["b"]},{key:"b",selected:false,satisfied:false,prerequisites:["a"]}])].sort(),["a","b"]);
});

test("unrelated optional concepts are not auto-selected",()=>{
  assert.deepEqual([...closePrerequisiteSelection([{key:"foundation",selected:false,satisfied:false,prerequisites:[]},{key:"dependent",selected:true,satisfied:false,prerequisites:["foundation"]},{key:"optional",selected:false,satisfied:false,prerequisites:[]}])].sort(),["dependent","foundation"]);
});

test("trial runway is bounded and dependency ordered while full scope remains available",()=>{
  const full=[{key:"dependent",prerequisites:["foundation"]},{key:"foundation",prerequisites:[]},...Array.from({length:7},(_,i)=>({key:`future-${i}`,prerequisites:[]}))];
  const runway=selectTrialRunwayConcepts(full,6);
  assert.equal(runway.length,6);assert.equal(runway[0]!.key,"foundation");assert.equal(runway[1]!.key,"dependent");assert.equal(full.length,9);
});

test("trial runway rejects dependency cycles instead of silently generating an invalid unit",()=>{
  assert.throws(()=>selectTrialRunwayConcepts([{key:"a",prerequisites:["b"]},{key:"b",prerequisites:["a"]}]),/CONCEPT_DEPENDENCY_CYCLE/);
});

const compactTeaching={introduction:"Learn to bound waiting in your checkout service.",lessons:[{
  conceptKey:"bounded-waiting",title:"Bound dependency latency",objective:"Protect checkout from a stalled dependency",
  blocks:[
    {type:"TEXT",title:"Plain explanation",body:"A timeout puts a limit on waiting for a dependency.",items:[],language:"",code:""},
    {type:"TEXT",title:"Why it matters",body:"Checkout must respond even when its upstream service stalls.",items:[],language:"",code:""},
    {type:"BULLETS",title:"Key pattern",body:"",items:["Choose the limit from your request budget."],language:"",code:""},
    {type:"CODE",title:"Bound one request",body:"The caller handles timeout as a recoverable failure.",items:["The signal cancels waiting."],language:"typescript",code:"// Bound waiting so checkout does not stall indefinitely.\nawait fetch(url, { signal: AbortSignal.timeout(1000) });"},
  ],recap:["Bound dependency waits.","Handle timeout explicitly."]
}]};

test("mobile teaching enforces compact structured code and prose budgets",()=>{
  assert.equal(generatedUnitTeachingSchema.safeParse(compactTeaching).success,true);
  const oversized=structuredClone(compactTeaching);oversized.lessons[0]!.blocks[3]!.code=Array(26).fill("call();").join("\n");
  assert.equal(generatedUnitTeachingSchema.safeParse(oversized).success,false);
  const repeated=structuredClone(compactTeaching);repeated.lessons[0]!.blocks.push({...repeated.lessons[0]!.blocks[3]!});
  assert.equal(generatedUnitTeachingSchema.safeParse(repeated).success,false);
  const prose=structuredClone(compactTeaching);prose.lessons[0]!.blocks[0]!.body="x".repeat(1001);
  assert.equal(generatedUnitTeachingSchema.safeParse(prose).success,false);
  const fenced=structuredClone(compactTeaching);fenced.lessons[0]!.blocks[3]!.code="```ts\ncall();\n```";
  assert.equal(generatedUnitTeachingSchema.safeParse(fenced).success,false);
});

test("teaching request sends mobile policy, learner depth and matching structured fields",async()=>{
  const provider=new OpenAILearningReasoningProvider("test-key-that-is-long-enough","gpt-test",{fetchImpl:async(_url,init)=>{
    const request=JSON.parse(String(init?.body));
    assert.match(request.instructions,/8-20 lines, never over 25/);
    assert.match(request.instructions,/WHY comments/);
    assert.equal(JSON.parse(request.input).targetDepth,"DEEP");
    const blocks=request.text.format.schema.properties.lessons.items.properties.blocks;
    assert.equal(blocks.maxItems,6);assert.ok(blocks.items.required.includes("code"));
    assert.equal(blocks.items.properties.body.maxLength,1000);
    return completed(compactTeaching);
  }});
  const result=await provider.generateUnitTeaching({learnerId:"test",targetDepth:"DEEP",unit:{},concepts:[{key:"bounded-waiting"}],learnerContext:{product:"checkout"},knownConcepts:[]});
  assert.equal(result.value.lessons[0]!.blocks[3]!.code,compactTeaching.lessons[0]!.blocks[3]!.code);
});

test("generated labs require editable starter content in every YOU_BUILD file",()=>{
  const lab={overview:"Practice",goal:"Implement the target",evaluationCriteria:["Checks pass"],files:[
    {path:"solution.ts",role:"YOU_BUILD",content:"export function solve() {\n  // TODO: implement\n}",humanMeaning:"Learner file",technicalRole:"Implementation",inputOutput:"Input to output",learningPurpose:"Practice"},
    {path:"solution.test.ts",role:"TEST",content:"test('solution', () => {});",humanMeaning:"Tests",technicalRole:"Verification",inputOutput:"Code to result",learningPurpose:"Feedback"},
  ]};
  assert.equal(generatedLabSchema.safeParse(lab).success,true);
  assert.equal(generatedLabSchema.safeParse({...lab,files:[{...lab.files[0]!,content:""},lab.files[1]!]}).success,false);
});
