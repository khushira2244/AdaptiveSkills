import assert from "node:assert/strict";
import test from "node:test";
import { packageIdForCountry,packageIdForOffer } from "../src/revenuecat-selection.ts";

test("India selects the INR Test Store package", () => {
  assert.equal(packageIdForCountry("IN"), "try_it_inr");
  assert.equal(packageIdForCountry("in"), "try_it_inr");
});

test("the temporary India-only launch uses the INR package for every locale", () => {
  assert.equal(packageIdForCountry("US"), "try_it_inr");
  assert.equal(packageIdForCountry("GB"), "try_it_inr");
  assert.equal(packageIdForCountry(null), "try_it_inr");
});

test("continuation uses its configured package without changing Try It selection",()=>{
  assert.equal(packageIdForOffer("IN","growth_runway"),"growth_runway");
  assert.equal(packageIdForOffer("US","growth_runway"),"growth_runway");
  assert.equal(packageIdForOffer("IN"),"try_it_inr");
});
