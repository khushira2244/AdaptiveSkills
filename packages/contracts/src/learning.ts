import { z } from "zod";

export const paidSetupStatusSchema=z.enum(["TRIAL_PAID_SETUP_PENDING","TRIAL_SCOPE_PROPOSED","TRIAL_SCOPE_CONFIRMED","TRIAL_GENERATING","TRIAL_READY","TRIAL_GENERATION_FAILED"]);
export const requirementClassSchema=z.enum(["REQUIRED","USEFUL","OPTIONAL"]);
export const learnerConceptRelationshipSchema=z.enum(["KNOWN_REPORTED","KNOWN_PROVEN","RECOMMENDED_NEXT","DEEPER_OPTIONAL","NOT_RELEVANT"]);
export const targetPathSchema=z.enum(["FRONTEND_ENGINEER","BACKEND_ENGINEER","FULL_STACK_ENGINEER","AI_APPLICATION_ENGINEER","CLOUD_DEVOPS_ENGINEER"]);
export const targetDepthSchema=z.enum(["BASIC","STANDARD","DEEP"]);
export const mapConceptStatusSchema=z.enum(["KNOWN","RECOMMENDED","DEEP"]);
export const setupContextPutSchema=z.strictObject({
  revision:z.number().int().nonnegative(), jdText:z.string().trim().max(100_000).nullable(),
  targetCompany:z.string().trim().max(200).nullable(), productStyle:z.string().trim().max(300).nullable(),
  targetDepth:targetDepthSchema,
});
export const setupRevisionSchema=z.strictObject({ revision:z.number().int().nonnegative() });
export const jdDocumentUploadSchema=z.strictObject({
  filename:z.string().trim().min(1).max(180).refine(v=>!/[\\/\x00-\x1f]/.test(v),"Use a filename, not a path"),
  mimeType:z.enum(["text/plain","application/pdf","application/vnd.openxmlformats-officedocument.wordprocessingml.document"]),
  contentBase64:z.string().min(4).max(2_800_000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
});
export const jdDocumentTextSchema=z.strictObject({filename:z.string(),mimeType:z.string(),text:z.string().min(1).max(200_000)});
export const learningScopePutSchema=z.strictObject({
  revision:z.number().int().nonnegative(),
  items:z.array(z.strictObject({ conceptId:z.string().min(1).max(100),selected:z.boolean() })).max(200)
    .refine(v=>new Set(v.map(x=>x.conceptId)).size===v.length,"Duplicate concepts"),
});
export const targetRequirementSchema=z.strictObject({ name:z.string(),classification:requirementClassSchema,reason:z.string(),source:z.enum(["GOAL","PROFILE","JD","INTEREST"]) });
export const learningMapConceptSchema=z.strictObject({
  conceptId:z.string(),name:z.string(),shortExample:z.string(),status:mapConceptStatusSchema,
  relationship:learnerConceptRelationshipSchema,recommendationReason:z.string(),selected:z.boolean(),
  depthCategory:z.enum(["FOUNDATION","APPLIED","DEEP"]),requirementClass:requirementClassSchema,
});
export const learningMapCapabilitySchema=z.strictObject({
  capabilityId:z.string(),name:z.string(),tab:z.string().min(1).max(100),
  reason:z.string(),scenario:z.string(),concepts:z.array(learningMapConceptSchema),
});
export const learningUnitSchema=z.strictObject({
  unitId:z.uuid(),sequence:z.union([z.literal(1),z.literal(2)]),title:z.string(),goal:z.string(),
  prerequisites:z.array(z.string()),productContext:z.string(),groupingReason:z.string(),
  labOutcomePlaceholder:z.string(),concepts:z.array(z.strictObject({conceptId:z.string(),name:z.string()})),
});
export const lessonContentBlockSchema=z.strictObject({blockId:z.uuid(),position:z.number().int().nonnegative(),type:z.enum(["EXPLANATION","WHY_IT_MATTERS","TECHNICAL_DETAIL","EXAMPLE","STRUCTURED_VISUAL","CHECKPOINT","TEXT","BULLETS","CODE"]),title:z.string(),body:z.string(),items:z.array(z.string()),language:z.string(),code:z.string()});
export const conceptLessonSchema=z.strictObject({lessonId:z.uuid(),conceptId:z.string(),conceptName:z.string(),position:z.number().int().nonnegative(),title:z.string(),objective:z.string(),recap:z.array(z.string()),completed:z.boolean(),lastBlockPosition:z.number().int().nonnegative(),blocks:z.array(lessonContentBlockSchema)});
export const unitTeachingSchema=z.strictObject({unitId:z.uuid(),introduction:z.string(),generated:z.literal(true),lessons:z.array(conceptLessonSchema)});
export const lessonProgressPutSchema=z.strictObject({lastBlockPosition:z.number().int().nonnegative(),completed:z.boolean()});
export const paidSetupStateSchema=z.strictObject({
  learnerId:z.uuid(),goalId:z.uuid(),revision:z.number().int().nonnegative(),status:paidSetupStatusSchema,
  context:z.strictObject({ targetPath:targetPathSchema.nullable(),targetDepth:targetDepthSchema,role:z.string().nullable(),goal:z.string(),skills:z.array(z.strictObject({name:z.string(),level:z.string().nullable(),source:z.string()})),interests:z.array(z.string()),timelineDays:z.number().nullable(),pace:z.string().nullable(),jdText:z.string().nullable(),targetCompany:z.string().nullable(),productStyle:z.string().nullable() }),
  requirements:z.array(targetRequirementSchema),learningMap:z.array(learningMapCapabilitySchema),units:z.array(learningUnitSchema),failureCode:z.string().nullable(),
});
export type PaidSetupState=z.infer<typeof paidSetupStateSchema>;
