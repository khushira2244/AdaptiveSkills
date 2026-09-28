import assert from "node:assert/strict";
import test from "node:test";
import type { LabEvidenceResult } from "@adaptive-labs/contracts";
import { canEditFile, canUseHint, evidenceBuckets, hintNumber, nextActionLabel, nextActionRoute, resolveLabEntry, roleLabel, saveStateLabel } from "../src/lab-workspace-model.ts";

test("file roles and backend attempt state control edit permissions",()=>{
  assert.equal(canEditFile("YOU_BUILD","IN_PROGRESS","attempt"),true);
  for(const role of ["PROVIDED","READ_ONLY","OPTIONAL_REFERENCE","TEST"] as const)assert.equal(canEditFile(role,"IN_PROGRESS","attempt"),false);
  assert.equal(canEditFile("YOU_BUILD","READY",null),false);
  assert.equal(canEditFile("YOU_BUILD","COMPLETE",null),false);
  assert.equal(roleLabel("YOU_BUILD"),"YOU BUILD");
});

test("autosave states map to truthful learner labels",()=>{
  assert.equal(saveStateLabel("dirty"),"Unsaved");
  assert.equal(saveStateLabel("saving"),"Saving…");
  assert.equal(saveStateLabel("saved"),"Saved");
  assert.equal(saveStateLabel("error"),"Save failed");
});

test("hints remain file-scoped and limited by backend usage",()=>{
  assert.equal(canUseHint("YOU_BUILD",0,"attempt"),true);
  assert.equal(hintNumber(0),1);assert.equal(hintNumber(1),2);
  assert.equal(canUseHint("YOU_BUILD",2,"attempt"),false);
  assert.equal(canUseHint("PROVIDED",0,"attempt"),false);
});

test("submission next actions preserve backend navigation meaning",()=>{
  assert.equal(nextActionRoute("DOUBT_CLEARANCE"),"/learn");
  assert.equal(nextActionLabel("DOUBT_CLEARANCE"),"Clear doubts");
  assert.equal(nextActionRoute("CONTINUE_LEARNING"),"/learn");
  assert.equal(nextActionRoute("REVIEW_NEXT_RUNWAY"),"/home");
});

test("lab navigation prefers an owned deep link and otherwise resumes the backend current lab",()=>{
  assert.equal(resolveLabEntry("saved-lab","current-lab"),"saved-lab");
  assert.equal(resolveLabEntry(null,"current-lab"),"current-lab");
  assert.equal(resolveLabEntry(null,null),null);
});

test("evidence display groups existing backend outcomes without recomputing them",()=>{
  const evidence=[item("one","INDEPENDENT","DEMONSTRATED"),item("two","HINT_1","DEMONSTRATED"),item("three","SYSTEM_ASSISTED","PARTIAL"),item("four","NOT_DEMONSTRATED","NOT_DEMONSTRATED")];
  const grouped=evidenceBuckets(evidence);
  assert.deepEqual(grouped.demonstrated.map(value=>value.evidenceId),["one"]);
  assert.deepEqual(grouped.assisted.map(value=>value.evidenceId),["two","three"]);
  assert.deepEqual(grouped.notDemonstrated.map(value=>value.evidenceId),["four"]);
});

function item(evidenceId:string,assistanceLevel:LabEvidenceResult["assistanceLevel"],outcome:LabEvidenceResult["outcome"]):LabEvidenceResult{return{evidenceId,conceptId:null,conceptName:null,assistanceLevel,outcome,details:{},createdAt:"2026-09-28T00:00:00.000Z"};}
