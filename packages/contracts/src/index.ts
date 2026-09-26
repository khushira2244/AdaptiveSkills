import { z } from "zod";
export * from "./onboarding.js";
export * from "./commerce.js";
export * from "./learning.js";
export * from "./continuation.js";

export const healthResponseSchema = z.strictObject({
  status: z.literal("ok"),
  service: z.literal("adaptive-labs-api"),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const apiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.string().min(1),
    message: z.string().min(1),
    requestId: z.string().min(1),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
