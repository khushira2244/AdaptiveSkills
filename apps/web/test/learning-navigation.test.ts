import assert from "node:assert/strict";
import test from "node:test";
import { learningUnitSchema, type ConceptLesson, type LearningUnit } from "@adaptive-labs/contracts";
import { markerForAction, pickLessonIndex, pickUnit, restoredSections, selectionContext, sourceRoute } from "../src/learning-navigation.ts";

const units=[unit("locked","LOCKED",1),unit("ready","READY",2),unit("done","COMPLETE",3)];

test("unit navigation obeys backend runway status and resume id",()=>{
  assert.equal(pickUnit(units,"locked","ready")?.unitId,"ready");
  assert.equal(pickUnit(units,"done","ready")?.unitId,"done");
  assert.equal(pickUnit(units,null,"missing")?.unitId,"ready");
});

test("learning-unit contract carries backend lock status for any runway length",()=>{
  assert.equal(learningUnitSchema.parse(unit("00000000-0000-4000-8000-000000000005","LOCKED",5)).status,"LOCKED");
});

test("concept resume restores the backend lesson and reached sections",()=>{
  const lessons=[lesson("a",true,3),lesson("b",false,2),lesson("c",false,0)];
  assert.equal(pickLessonIndex(lessons,null),1);
  assert.equal(pickLessonIndex(lessons,"c"),2);
  assert.deepEqual(restoredSections(lessons[1]!),["b-1","b-2"]);
  assert.deepEqual(restoredSections(lessons[0]!),["a-1","a-2","recap:a-lesson"]);
});

test("selection actions preserve exact selected text, context, and marker mapping",()=>{
  const result=selectionContext("  Promise.all  ","Use Promise.all for independent calls and await the combined result.");
  assert.equal(result.selectedText,"Promise.all");
  assert.match(result.sourceContext,/Promise\.all/);
  assert.equal(markerForAction.know,"I_KNOW_THIS");
  assert.equal(markerForAction.doubt,"DONT_UNDERSTAND");
  assert.equal(markerForAction.deeper,"GO_DEEPER");
});

test("saved context maps back to the precise teaching source",()=>{
  assert.equal(sourceRoute("unit-id","concept/id"),"/learn?unit=unit-id&concept=concept%2Fid");
  assert.equal(sourceRoute(null,null),"/learn");
});

function unit(unitId:string,status:LearningUnit["status"],sequence:number):LearningUnit{return{unitId,sequence,title:unitId,goal:"goal",status,prerequisites:[],productContext:"context",groupingReason:"reason",labOutcomePlaceholder:"lab",concepts:[]};}
function lesson(conceptId:string,completed:boolean,lastBlockPosition:number):ConceptLesson{return{lessonId:`${conceptId}-lesson`,conceptId,conceptName:conceptId,position:0,title:conceptId,objective:"objective",recap:["recap"],completed,lastBlockPosition,blocks:[block(`${conceptId}-1`,0),block(`${conceptId}-2`,1)]};}
function block(blockId:string,position:number){return{blockId,position,type:"TEXT" as const,title:blockId,body:"body",items:[],language:"",code:""};}
