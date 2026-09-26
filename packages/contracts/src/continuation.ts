import { z } from "zod";

export const commercialProductKeySchema=z.enum(["TRY_IT","FOCUS","GROWTH","DEEP"]);
export const assistanceLevelSchema=z.enum(["INDEPENDENT","HINT_1","HINT_2","SYSTEM_ASSISTED","NOT_DEMONSTRATED"]);
export const markerTypeSchema=z.enum(["I_KNOW_THIS","DONT_UNDERSTAND","GO_DEEPER"]);
export const learningSourceTypeSchema=z.enum(["WORD","PHRASE","SENTENCE","PARAGRAPH","CODE_LINE","CODE_SELECTION","CONCEPT_SECTION","UNIT","LAB","LAB_FILE","LAB_STEP"]);
export const resolutionTypeSchema=z.enum(["EXPLAIN_AT_CHECKPOINT","RESOLVE_BEFORE_LAB","MERGE_INTO_LAB","MERGE_INTO_NEXT_UNIT","GENERATE_REPAIR","RESOLVED_BY_EVIDENCE"]);
export const learningNextActionSchema=z.enum(["CONTINUE_LEARNING","DOUBT_CLEARANCE","START_LAB","RESUME_LAB","REVIEW_NEXT_RUNWAY","VIEW_NEXT_RUNWAY","WAIT_REFRESH"]);
export const markerCreateSchema=z.strictObject({sourceType:learningSourceTypeSchema,sourceId:z.string().max(500).nullable(),unitId:z.uuid().nullable(),conceptId:z.string().max(200).nullable(),labId:z.uuid().nullable(),selectedText:z.string().trim().max(2000).nullable(),markerType:markerTypeSchema});
export const noteCreateSchema=z.strictObject({sourceType:learningSourceTypeSchema,sourceId:z.string().max(500).nullable(),unitId:z.uuid().nullable(),conceptId:z.string().max(200).nullable(),labId:z.uuid().nullable(),fileId:z.uuid().nullable(),selectedText:z.string().trim().max(4000).nullable(),attachmentType:z.enum(["UNIT","CONCEPT","SELECTED_TEXT","LAB","FILE","CODE_SELECTION","LAB_STEP"]),attachmentRef:z.string().max(500).nullable(),body:z.string().trim().min(1).max(20_000)});
export const markedWordCreateSchema=z.strictObject({sourceType:learningSourceTypeSchema,sourceId:z.string().max(500).nullable(),unitId:z.uuid().nullable(),conceptId:z.string().max(200).nullable(),labId:z.uuid().nullable(),selectedText:z.string().trim().min(1).max(500),sourceContext:z.string().trim().max(2000).nullable(),learnerStatus:markerTypeSchema});
export const hintRequestSchema=z.strictObject({attemptId:z.uuid(),fileId:z.uuid()});
export const labAutosaveSchema=z.strictObject({attemptId:z.uuid(),fileId:z.uuid(),content:z.string().max(500_000),version:z.number().int().positive()});
export const labRunSchema=z.strictObject({attemptId:z.uuid()});
export const labSubmitSchema=z.strictObject({attemptId:z.uuid()});
export const systemAssistanceSchema=z.strictObject({attemptId:z.uuid()});
export const evidenceCreateSchema=z.strictObject({attemptId:z.uuid(),conceptId:z.string().max(200).nullable(),assistanceLevel:assistanceLevelSchema,outcome:z.enum(["DEMONSTRATED","PARTIAL","NOT_DEMONSTRATED"]),details:z.record(z.string(),z.unknown()).default({})});
export const doubtPlanSchema=z.strictObject({doubtId:z.uuid(),resolutionType:resolutionTypeSchema,targetUnitId:z.uuid().nullable(),targetLabId:z.uuid().nullable(),reason:z.string().trim().min(1).max(1000)});
export const continuationStateSchema=z.strictObject({
  runwayId:z.uuid(),commercialProductKey:commercialProductKeySchema,plannedUnits:z.number().int().positive(),plannedLabs:z.number().int().nonnegative(),status:z.string(),
  nextAction:learningNextActionSchema,nextUnitId:z.uuid().nullable(),nextLabId:z.uuid().nullable(),openDoubts:z.number().int().nonnegative(),
  nextOffer:z.strictObject({commercialProductKey:commercialProductKeySchema,plannedUnits:z.number().int().positive(),plannedLabs:z.number().int().nonnegative(),revenueCatOfferingId:z.string(),revenueCatPackageId:z.string().nullable(),revenueCatProductId:z.string().nullable(),entitlementKey:z.string(),available:z.boolean()}).nullable(),
});
export type ContinuationState=z.infer<typeof continuationStateSchema>;
