import { z } from "zod";

export const productKeySchema = z.literal("TRY_IT_WITH_LABS");
export const trialStatusSchema = z.enum(["NOT_PURCHASED","PURCHASE_PENDING","ACTIVE_SETUP_PENDING","ACTIVE","COMPLETED"]);
export const homeStateSchema = z.strictObject({
  state: z.enum(["PROFILE_COMPLETE_UNPAID","PURCHASE_IN_PROGRESS","TRIAL_PAID_SETUP_PENDING"]),
  learner: z.strictObject({
    name: z.string(), goal: z.string(), timelineDays: z.number().int().nullable(),
    strengthSummary: z.string().nullable(), interests: z.array(z.string()),
  }),
  revenueCat: z.strictObject({ appUserId: z.string(), entitlementKey: z.string(), offeringId: z.string() }),
  offer: z.strictObject({
    productKey: productKeySchema, localizedPrice: z.null(), currencyCode: z.null(),
    available: z.null(), pricingSource: z.literal("REVENUECAT_SDK"),
  }).nullable(),
  trial: z.strictObject({ status: trialStatusSchema, activatedAt: z.string().nullable() }),
  learningState:z.enum(["NEXT_UNIT_READY","DOUBT_CLEARANCE_REQUIRED","LAB_READY","LAB_IN_PROGRESS","CURRENT_RUNWAY_COMPLETE","NEXT_RUNWAY_AWAITING_PURCHASE","NEXT_RUNWAY_PURCHASED_GENERATING","NEXT_RUNWAY_READY"]).nullable(),
  primaryAction: z.strictObject({ type: z.enum(["START_TRIAL_PURCHASE","WAIT_FOR_PURCHASE","CONTINUE_TRIAL_SETUP","CONTINUE_LEARNING","DOUBT_CLEARANCE","START_LAB","RESUME_LAB","REVIEW_NEXT_RUNWAY","VIEW_NEXT_RUNWAY","WAIT_REFRESH"]) }),
});
export const purchaseIntentSchema = z.strictObject({
  platform: z.enum(["ios","android"]), countryCode: z.string().regex(/^[A-Z]{2}$/).nullable().optional(),
});
export const purchaseOutcomeSchema = z.strictObject({
  purchaseAttemptId: z.uuid(), outcome: z.enum(["CANCELLED","FAILED"]),
  errorCode: z.string().trim().min(1).max(120).nullable().optional(),
});
export const purchaseIntentResponseSchema = z.strictObject({
  purchaseAttemptId: z.uuid().nullable(), revenueCatAppUserId: z.string(), productKey: productKeySchema,
  entitlementKey: z.string(), status: z.enum(["PENDING","ALREADY_ACTIVE"]),
});
export const billingStateSchema = z.strictObject({
  trialStatus: trialStatusSchema,
  purchase: z.strictObject({
    productKey: productKeySchema, productId: z.string(), amount: z.number().nullable(),
    currencyCode: z.string().nullable(), store: z.string().nullable(), status: z.enum(["SUCCEEDED","REVOKED"]),
    purchasedAt: z.string().nullable(), transactionId: z.string(),
  }).nullable(),
  message: z.literal("This is a one-time purchase, not a recurring subscription."),
});
export type HomeState = z.infer<typeof homeStateSchema>;
export type TrialStatus = z.infer<typeof trialStatusSchema>;
