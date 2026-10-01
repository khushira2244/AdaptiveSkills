import assert from "node:assert/strict";
import test from "node:test";
import { appBackAction,canOpenUnit,homeLabForUnit,labContinueLabel,labForUnit,shouldGenerateTeaching,unitStatusLabel } from "../src/learning-navigation.ts";
import type { ContinuationState } from "../src/types.ts";
const state:ContinuationState={runwayId:"runway",commercialProductKey:"TRY_IT",plannedUnits:2,plannedLabs:2,status:"ACTIVE",nextAction:"RESUME_LAB",nextUnitId:"unit-1",nextLabId:"saved-lab",openDoubts:0,nextRoadmap:[]};
test("Home resume and start lab actions target the saved lab for the correct unit",()=>{
  assert.equal(homeLabForUnit("unit-1",state),"saved-lab");
  assert.equal(homeLabForUnit("unit-1",{...state,nextAction:"START_LAB"}),"saved-lab");
  assert.equal(homeLabForUnit("unit-2",state),null);
  assert.equal(homeLabForUnit("unit-2",{...state,nextUnitId:"unit-2"}),"saved-lab");
});

test("completed and current units use persisted status",()=>{
  assert.equal(unitStatusLabel("COMPLETE"),"Completed");
  assert.equal(unitStatusLabel("READY"),"Current");
  assert.equal(canOpenUnit("LOCKED"),false);
  assert.equal(canOpenUnit("COMPLETE"),true);
});

test("completed units never regenerate teaching",()=>{
  assert.equal(shouldGenerateTeaching("COMPLETE",404),false);
  assert.equal(shouldGenerateTeaching("DOUBT_CHECKPOINT",404),false);
  assert.equal(shouldGenerateTeaching("READY",404),true);
  assert.equal(shouldGenerateTeaching("READY",500),false);
});

test("saved labs reopen by unit and completion routes explicitly",()=>{
  const saved={labId:"lab-1",unitId:"unit-1"} as never;
  assert.equal(labForUnit("unit-1",[saved])?.labId,"lab-1");
  assert.equal(labForUnit("unit-2",[saved]),null);
  assert.equal(labContinueLabel("CONTINUE_LEARNING"),"Continue to next unit");
  assert.equal(labContinueLabel("REVIEW_NEXT_RUNWAY"),"Return to Home");
  assert.equal(labContinueLabel("VIEW_NEXT_RUNWAY"),"Return to Home");
});

test("Android Back exits Home and leaves inner learning navigation to its screen",()=>{
  assert.equal(appBackAction("paidHome"),"EXIT");
  assert.equal(appBackAction("home"),"EXIT");
  assert.equal(appBackAction("learning"),"DEFER");
  assert.equal(appBackAction("billing"),"PAID_HOME");
});
test("Teaching, unavailable state and absent lab IDs do not route to another lab",()=>{
  assert.equal(homeLabForUnit("unit-1",null),null);
  assert.equal(homeLabForUnit("unit-1",{...state,nextAction:"CONTINUE_LEARNING"}),null);
  assert.equal(homeLabForUnit("unit-1",{...state,nextLabId:null}),null);
});
