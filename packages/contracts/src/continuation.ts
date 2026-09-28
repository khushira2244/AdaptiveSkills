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
export const learningNoteSchema=z.strictObject({noteId:z.uuid(),sourceType:learningSourceTypeSchema,sourceId:z.string().nullable(),unitId:z.uuid().nullable(),conceptId:z.string().nullable(),labId:z.uuid().nullable(),fileId:z.uuid().nullable(),selectedText:z.string().nullable(),body:z.string(),createdAt:z.string(),updatedAt:z.string()});
export const markedWordSchema=z.strictObject({markedWordId:z.uuid(),sourceType:learningSourceTypeSchema,sourceId:z.string().nullable(),unitId:z.uuid().nullable(),conceptId:z.string().nullable(),labId:z.uuid().nullable(),selectedText:z.string(),simpleMeaning:z.string(),technicalMeaning:z.string(),sourceContext:z.string().nullable(),learnerStatus:markerTypeSchema,createdAt:z.string(),resolvedAt:z.string().nullable()});
export const learningDoubtSchema=z.strictObject({doubtId:z.uuid(),sourceText:z.string().nullable(),markerType:markerTypeSchema,status:z.enum(["OPEN","PLANNED","DEFERRED"]),resolutionType:resolutionTypeSchema.nullable(),unitId:z.uuid().nullable(),conceptName:z.string().nullable(),unitTitle:z.string().nullable(),context:z.record(z.string(),z.unknown()).nullable()});
export type ContinuationState=z.infer<typeof continuationStateSchema>;
export type LearningNote=z.infer<typeof learningNoteSchema>;
export type MarkedWord=z.infer<typeof markedWordSchema>;
export type LearningDoubt=z.infer<typeof learningDoubtSchema>;
export type MarkerType=z.infer<typeof markerTypeSchema>;
export type LearningSourceType=z.infer<typeof learningSourceTypeSchema>;
export type LabFileRole="PROVIDED"|"READ_ONLY"|"YOU_BUILD"|"OPTIONAL_REFERENCE"|"TEST";
export type LabFile={fileId:string;path:string;role:LabFileRole;content:string|null;draft:string|null;version:number|null;savedAt:string|null;humanMeaning:string|null;technicalRole:string|null;inputOutput:string|null;learningPurpose:string|null};
export type LabRunResult={runId:string;status:"PASSED"|"FAILED"|"ERROR";result:Record<string,unknown>;createdAt:string};
export type LabSubmissionResult={submissionId:string;completed:boolean;evaluation:{passed?:boolean;assistanceLevel?:string;runCount?:number;[key:string]:unknown};createdAt:string};
export type LabEvidenceResult={evidenceId:string;conceptId:string|null;conceptName:string|null;assistanceLevel:z.infer<typeof assistanceLevelSchema>;outcome:"DEMONSTRATED"|"PARTIAL"|"NOT_DEMONSTRATED";details:Record<string,unknown>;createdAt:string};
export type LabCompletion={attemptId:string;attemptStatus:"IN_PROGRESS"|"SUBMITTED"|"COMPLETE";highestAssistanceLevel:string;hintsUsed:number;systemAssistanceUsed:boolean;run:LabRunResult|null;submission:LabSubmissionResult|null;evidence:LabEvidenceResult[]};
export type LabState={labId:string;unitId:string;title:string;status:"LOCKED"|"READY"|"IN_PROGRESS"|"COMPLETE";context:Record<string,unknown>;attemptId:string|null;hintsUsed:number|null;systemAssistanceUsed:boolean|null;nextAction:z.infer<typeof learningNextActionSchema>;concepts:{conceptId:string;name:string}[];hints:{fileId:string|null;hintNumber:1|2;hint:string;createdAt:string}[];files:LabFile[];completion:LabCompletion|null};
export type LabSubmitResult={passed:boolean;labId:string;submissionId:string;evaluation:{passed:boolean;assistanceLevel:string;runCount:number};nextAction:z.infer<typeof learningNextActionSchema>};
export const labWorkSummarySchema=z.strictObject({
  labId:z.uuid(),unitId:z.uuid(),unitTitle:z.string(),title:z.string(),status:z.enum(["LOCKED","READY","IN_PROGRESS","COMPLETE"]),updatedAt:z.string(),
  attempt:z.strictObject({attemptId:z.uuid(),status:z.enum(["IN_PROGRESS","SUBMITTED","COMPLETE"]),hintsUsed:z.number().int().nonnegative(),systemAssistanceUsed:z.boolean(),startedAt:z.string(),completedAt:z.string().nullable()}).nullable(),
  submission:z.strictObject({submissionId:z.uuid(),completed:z.boolean(),evaluation:z.record(z.string(),z.unknown()),createdAt:z.string()}).nullable(),
  evidence:z.strictObject({demonstrated:z.number().int().nonnegative(),partial:z.number().int().nonnegative(),notDemonstrated:z.number().int().nonnegative()}),
});
export type LabWorkSummary=z.infer<typeof labWorkSummarySchema>;
