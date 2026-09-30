import assert from "node:assert/strict";
import test from "node:test";
import type { OnboardingState } from "@adaptive-labs/contracts";
import { validateStep } from "../src/onboarding/service.js";

test("skills advance without proficiency classification and preserve historical levels", () => {
  const state: OnboardingState = {
    learnerId: "00000000-0000-4000-8000-000000000001",
    version: 4,
    currentStep: "skills",
    completed: false,
    profile: { displayName: "Learner", currentRole: "Engineer", experienceYears: 2 },
    resume: null,
    skills: [
      { name: "TypeScript", source: "CV_CONFIRMED", level: "PRODUCTION", subskills: [] },
      { name: "CAD", source: "MANUAL", level: null, subskills: [{ name: "Modeling", level: null }] },
    ],
    goal: null,
    interests: [],
    preferences: { timelineDays: null, pace: null },
    nextRoute: "ONBOARDING",
  };

  assert.doesNotThrow(() => validateStep(state, "skills"));
  assert.equal(state.skills[0]?.level, "PRODUCTION");
  assert.equal(state.skills[1]?.level, null);
});
