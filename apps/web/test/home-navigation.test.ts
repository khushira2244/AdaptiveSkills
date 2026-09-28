import assert from "node:assert/strict";
import test from "node:test";
import { actionButton, routeForAction } from "../src/home-navigation.ts";

test("Home routes every backend primary action without inventing state", () => {
  assert.equal(routeForAction("START_TRIAL_PURCHASE"), "/billing");
  assert.equal(routeForAction("CONTINUE_TRIAL_SETUP"), "/setup");
  assert.equal(routeForAction("START_LAB"), "/work?current=1");
  assert.equal(routeForAction("RESUME_LAB"), "/work?current=1");
  for (const action of ["CONTINUE_LEARNING", "DOUBT_CLEARANCE", "WAIT_REFRESH"] as const) {
    assert.equal(routeForAction(action), "/learn");
  }
  for(const action of ["WAIT_FOR_PURCHASE","REVIEW_NEXT_RUNWAY","VIEW_NEXT_RUNWAY"] as const)assert.equal(routeForAction(action),"/billing");
});

test("Home labels preserve the backend action meaning", () => {
  assert.equal(actionButton("START_LAB"), "Open lab");
  assert.equal(actionButton("RESUME_LAB"), "Resume lab");
  assert.equal(actionButton("CONTINUE_TRIAL_SETUP"), "Continue setup");
  assert.equal(actionButton("WAIT_REFRESH"), "Refresh status");
});
