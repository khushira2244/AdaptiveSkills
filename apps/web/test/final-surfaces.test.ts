import assert from "node:assert/strict";
import test from "node:test";
import { accessTypeLabel,continuationView } from "../src/access-model.ts";
import { workRouteMode } from "../src/my-work-model.ts";

test("My Work keeps default history separate from explicit and current lab routes",()=>{
  assert.equal(workRouteMode(new URLSearchParams()),"HISTORY");
  assert.equal(workRouteMode(new URLSearchParams("lab=00000000-0000-0000-0000-000000000001")),"LAB");
  assert.equal(workRouteMode(new URLSearchParams("current=1")),"LAB");
});
test("verified entitlement state maps to truthful access copy",()=>{
  assert.equal(accessTypeLabel("NONE"),"No active access");assert.equal(accessTypeLabel("INITIAL"),"TRY_IT access active");assert.equal(accessTypeLabel("CONTINUATION"),"Growth runway active");
});
test("continuation UI follows backend runway state",()=>{
  assert.equal(continuationView("CURRENT_RUNWAY_COMPLETE"),"ANALYZE");assert.equal(continuationView("NEXT_RUNWAY_AWAITING_PURCHASE"),"PURCHASE_REQUIRED");assert.equal(continuationView("NEXT_RUNWAY_PURCHASED"),"VERIFYING");assert.equal(continuationView("NEXT_RUNWAY_READY"),"ACTIVE");
});
