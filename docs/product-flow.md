# Product flow

## Learner journey

```text
Sign up or log in
→ profile and onboarding
→ optional CV/resume extraction
→ review, add, or remove skills
→ goal, target role, or JD context
→ RevenueCat trial access
→ learning-scope review
→ select depth and adjust flexible recommendations
→ generate exactly two trial units
→ teaching, notes, markers, and doubts
→ lab, hints, and optional System Assistance
→ submit and record evidence
→ next unit
→ continuation proposal and verified purchase
→ next adaptive runway
```

The skill-review step does not require manual proficiency buckets. Existing historical proficiency values remain compatible, while later reasoning and demonstrated work refine what is known.

The target analysis presents capabilities, concepts, dependencies, why an area matters, reported-known areas, recommendations, and deeper options. The learner confirms a dependency-valid scope before generation. The initial commercial runway is intentionally bounded to two units and two labs.

## Learning and evidence

Each unit contains ordered concepts. Teaching position, notes, marked words, and doubts persist. Completing the unit unlocks its practical lab. Each lab has exactly two normal hints; System Assistance is a separate path and is recorded as assistance. Submission produces evidence that distinguishes independent, assisted, and not-demonstrated outcomes.

After Lab 2, the existing continuation analysis uses the original goal, selected depth, remaining concepts, completed units, lab evidence, known or proven concepts, doubt state, and prior assistance. The next runway is proposed before purchase and remains saved after cancellation or failure. Activation occurs only after backend verification of the continuation entitlement.

## Safe navigation

Home follows the backend `primaryAction` and resumes the exact saved position. Once scope, units, teaching, or labs are generated, normal Home, Learn, back, and reopen actions return to persisted content. They must not navigate to an earlier generator or silently regenerate content. Completed labs reopen as read-only review, and moving forward after a result follows the backend-provided next action.
