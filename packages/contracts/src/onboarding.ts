import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);
export const onboardingSteps = ["profile", "role", "experience", "resume", "skills", "goal", "interests", "preferences", "review", "complete"] as const;
export const stepSchema = z.enum(onboardingSteps);
export const levelSchema = z.enum(["AWARE", "WORKING", "PRODUCTION", "DEEP"]);
export const credentialsSchema = z.strictObject({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(12).max(128),
});
export const profileSchema = z.strictObject({
  displayName: text(120).nullable(),
  currentRole: text(160).nullable(),
  experienceYears: z.number().min(0).max(80).nullable(),
});
export const skillSchema = z.strictObject({
  name: text(100), source: z.enum(["MANUAL", "CV_CONFIRMED"]).default("MANUAL"), level: levelSchema.nullable(),
  subskills: z.array(z.strictObject({ name: text(100), level: levelSchema.nullable() })).max(30),
}).refine(v => new Set(v.subskills.map(s => s.name.toLowerCase())).size === v.subskills.length, "Duplicate subskills");
export const skillsSchema = z.array(skillSchema).max(100).refine(
  v => new Set(v.map(s => s.name.toLowerCase())).size === v.length, "Duplicate skills");
export const goalSchema = z.strictObject({ target: text(3000), reason: text(3000).nullable() });
export const interestsSchema = z.array(text(120)).max(30).refine(
  v => new Set(v.map(s => s.toLowerCase())).size === v.length, "Duplicate interests");
export const preferencesSchema = z.strictObject({
  timelineDays: z.number().int().min(1).max(3650).nullable(),
  pace: z.enum(["CASUAL", "STEADY", "INTENSIVE"]).nullable(),
});
export const versionSchema = z.number().int().nonnegative();
export const profilePatchSchema = z.strictObject({ version: versionSchema, profile: profileSchema.partial() });
export const skillsPutSchema = z.strictObject({ version: versionSchema, skills: skillsSchema });
export const goalPutSchema = z.strictObject({ version: versionSchema, goal: goalSchema });
export const interestsPutSchema = z.strictObject({ version: versionSchema, interests: interestsSchema });
export const preferencesPutSchema = z.strictObject({ version: versionSchema, preferences: preferencesSchema });
export const advanceSchema = z.strictObject({ version: versionSchema, step: stepSchema });
export const completionSchema = z.strictObject({ version: versionSchema });
export const resumeUploadSchema = z.strictObject({
  version: versionSchema,
  filename: text(180).refine(v => !/[\\/\x00-\x1f]/.test(v), "Use a filename, not a path"),
  mimeType: z.enum(["text/plain", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]),
  contentBase64: z.string().min(4).max(2_800_000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
});
export const resumeConfirmSchema = z.strictObject({
  version: versionSchema, resumeId: z.uuid(), skillNames: z.array(text(100)).max(100),
});
export const resumeSchema = z.strictObject({
  resumeId: z.uuid(), filename: z.string(), mimeType: z.string(),
  suggestions: z.array(z.string()), confirmed: z.boolean(),
});
export const onboardingStateSchema = z.strictObject({
  learnerId: z.uuid(), version: versionSchema, currentStep: stepSchema, completed: z.boolean(),
  profile: profileSchema, resume: resumeSchema.nullable(), skills: skillsSchema,
  goal: goalSchema.nullable(), interests: interestsSchema, preferences: preferencesSchema,
  nextRoute: z.enum(["ONBOARDING", "UNPAID_HOME"]),
});
export const learnerMeSchema = z.strictObject({
  learner: z.strictObject({ learnerId: z.uuid(), displayName: z.string().nullable() }),
  onboardingComplete: z.boolean(), currentStep: stepSchema,
  productState: z.enum(["ONBOARDING", "UNPAID_HOME"]),
});
export const sessionSchema = z.strictObject({
  token: z.string(), expiresAt: z.iso.datetime(), learnerId: z.uuid(),
});
export type OnboardingState = z.infer<typeof onboardingStateSchema>;
export type Skill = z.infer<typeof skillSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type Goal = z.infer<typeof goalSchema>;
export type Preferences = z.infer<typeof preferencesSchema>;
export type Session = z.infer<typeof sessionSchema>;
