import assert from "node:assert/strict";
import test from "node:test";
import { homeLabForUnit } from "../src/learning-navigation.ts";
import type { ContinuationState } from "../src/types.ts";
const state:ContinuationState={runwayId:"runway",commercialProductKey:"TRY_IT",plannedUnits:2,plannedLabs:2,status:"ACTIVE",nextAction:"RESUME_LAB",nextUnitId:"unit-1",nextLabId:"saved-lab",openDoubts:0};
test("Home resume and start lab actions target the saved lab for the correct unit",()=>{
  assert.equal(homeLabForUnit("unit-1",state),"saved-lab");
  assert.equal(homeLabForUnit("unit-1",{...state,nextAction:"START_LAB"}),"saved-lab");
  assert.equal(homeLabForUnit("unit-2",state),null);
  assert.equal(homeLabForUnit("unit-2",{...state,nextUnitId:"unit-2"}),"saved-lab");
});
test("Teaching, unavailable state and absent lab IDs do not route to another lab",()=>{
  assert.equal(homeLabForUnit("unit-1",null),null);
  assert.equal(homeLabForUnit("unit-1",{...state,nextAction:"CONTINUE_LEARNING"}),null);
  assert.equal(homeLabForUnit("unit-1",{...state,nextLabId:null}),null);
});
