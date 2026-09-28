import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import {
  credentialsSchema, profilePatchSchema, skillsPutSchema, goalPutSchema,
  interestsPutSchema, preferencesPutSchema, advanceSchema, completionSchema,
  resumeUploadSchema, resumeConfirmSchema, learnerMeSchema, sessionSchema,
  purchaseIntentSchema,purchaseOutcomeSchema,
} from "@adaptive-labs/contracts";
import type { Database } from "@adaptive-labs/db";
import { identityService } from "../identity/service.js";
import { HttpError } from "../http-error.js";
import { LearnerProfileService, SkillProfileService, GoalService, InterestService,
  LearningPreferenceService, OnboardingStateService } from "./service.js";
import { ResumeIntakeService } from "../resume/service.js";
import { BillingHistoryService,HomeStateService,PurchaseStateService,RevenueCatCustomerService,RevenueCatWebhookService } from "../commerce/service.js";
import { registerLearningRoutes } from "../learning/routes.js";
import type { LearningReasoningProvider } from "../learning/reasoning.js";
import { registerContinuationRoutes } from "../continuation/routes.js";

declare module "fastify" {
  interface FastifyRequest { identity: { learnerId: string; tokenHash: string } | null }
}
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result=schema.safeParse(body);
  if (!result.success) throw new HttpError(400,"INVALID_INPUT","Invalid request fields: " +
    [...new Set(result.error.issues.map(i=>i.path.join(".") || "body"))].join(", "));
  return result.data;
}
function owner(request: FastifyRequest) {
  if (!request.identity) throw new HttpError(401,"UNAUTHORIZED","Authentication required");
  return request.identity.learnerId;
}
export async function registerLearnerRoutes(app: FastifyInstance, pool: Database, secret: string, storage: string,
  commerceConfig: { webhookToken?: string; secretApiKey?: string; projectId?: string; entitlementKey: string; offeringId: string; continuation:{offeringId:string;packageId:string;entitlementKey:string;productId:string;secretApiKey?:string;projectId?:string}; learningReasoning:LearningReasoningProvider|null }) {
  const identity=identityService(pool,secret);
  const state=new OnboardingStateService(pool);
  const profile=new LearnerProfileService(state), skills=new SkillProfileService(state);
  const goals=new GoalService(state), interests=new InterestService(state);
  const preferences=new LearningPreferenceService(state), resume=new ResumeIntakeService(state,pool,commerceConfig.learningReasoning,storage);
  const home=new HomeStateService(pool,commerceConfig.entitlementKey,commerceConfig.offeringId);
  const purchases=new PurchaseStateService(pool,commerceConfig.entitlementKey);
  const billing=new BillingHistoryService(pool,commerceConfig.entitlementKey,commerceConfig.continuation.entitlementKey);
  const webhooks=new RevenueCatWebhookService(pool,commerceConfig.entitlementKey,commerceConfig.continuation.entitlementKey,commerceConfig.continuation.productId);
  const revenueCatCustomers=new RevenueCatCustomerService(pool,commerceConfig.entitlementKey,
    commerceConfig.secretApiKey,commerceConfig.projectId);
  await app.register(rateLimit,{ global: true, max: 120, timeWindow: "1 minute" });
  app.decorateRequest("identity",null);
  app.addHook("onRequest",async (_request,reply)=> { reply.header("cache-control","no-store"); });
  app.post("/webhooks/revenuecat",{ bodyLimit:262144,config:{ rateLimit:{ max:300,timeWindow:"1 minute",groupId:"revenuecat-webhook" } } },async request=>{
    if (!commerceConfig.webhookToken) throw new HttpError(503,"REVENUECAT_NOT_CONFIGURED","RevenueCat webhook is not configured");
    const supplied=request.headers.authorization ?? "";
    const expected=commerceConfig.webhookToken;
    const valid=Buffer.byteLength(supplied)===Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(supplied),Buffer.from(expected));
    if (!valid) throw new HttpError(401,"INVALID_WEBHOOK_AUTH","Invalid webhook authorization");
    return webhooks.process(request.body);
  });
  const authOptions={ config: { rateLimit: { max: 10, timeWindow: "1 minute", groupId: "auth" } }, bodyLimit: 4096 };
  app.post("/auth/signup",authOptions,async (request,reply)=>{
    const input=parse(credentialsSchema,request.body);
    const session=await identity.signup(input.email,input.password);
    return reply.code(201).send(sessionSchema.parse(session));
  });
  app.post("/auth/login",authOptions,async request=>{
    const input=parse(credentialsSchema,request.body);
    return sessionSchema.parse(await identity.login(input.email,input.password));
  });
  await app.register(async protectedApp=>{
    protectedApp.addHook("onRequest",async request=>{
      request.identity=await identity.authenticate(request.headers.authorization);
    });
    protectedApp.post("/auth/logout",async (request,reply)=>{
      await identity.logout(request.identity!.tokenHash);
      return reply.code(204).send();
    });
    protectedApp.get("/me",async request=>{
      const snapshot=await state.read(owner(request));
      return learnerMeSchema.parse({
        learner: { learnerId:snapshot.learnerId,displayName:snapshot.profile.displayName },
        onboardingComplete:snapshot.completed,currentStep:snapshot.currentStep,productState:snapshot.nextRoute,
      });
    });
    protectedApp.get("/me/onboarding",async request=>state.read(owner(request)));
    protectedApp.get("/me/skills",async request=>(await state.read(owner(request))).skills);
    protectedApp.get("/me/home",async request=>home.read(owner(request)));
    protectedApp.get("/me/billing",async request=>billing.read(owner(request)));
    protectedApp.post("/me/purchases/intent",async request=>{
      const input=parse(purchaseIntentSchema,request.body);
      return purchases.start(owner(request),input.platform,input.countryCode ?? null);
    });
    protectedApp.post("/me/purchases/outcome",async request=>{
      const input=parse(purchaseOutcomeSchema,request.body);
      return purchases.outcome(owner(request),input.purchaseAttemptId,input.outcome,input.errorCode ?? null);
    });
    protectedApp.post("/me/commerce/reconcile",async request=>revenueCatCustomers.reconcile(owner(request)));
    protectedApp.patch("/me/profile",async request=>{
      const input=parse(profilePatchSchema,request.body);
      return profile.save(owner(request),input.version,{
        ...(input.profile.displayName !== undefined ? { displayName: input.profile.displayName } : {}),
        ...(input.profile.currentRole !== undefined ? { currentRole: input.profile.currentRole } : {}),
        ...(input.profile.experienceYears !== undefined ? { experienceYears: input.profile.experienceYears } : {}),
      });
    });
    protectedApp.put("/me/skills",async request=>{
      const input=parse(skillsPutSchema,request.body);
      return skills.save(owner(request),input.version,input.skills);
    });
    protectedApp.put("/me/goal",async request=>{
      const input=parse(goalPutSchema,request.body);
      return goals.save(owner(request),input.version,input.goal);
    });
    protectedApp.put("/me/interests",async request=>{
      const input=parse(interestsPutSchema,request.body);
      return interests.save(owner(request),input.version,input.interests);
    });
    protectedApp.put("/me/preferences",async request=>{
      const input=parse(preferencesPutSchema,request.body);
      return preferences.save(owner(request),input.version,input.preferences);
    });
    protectedApp.post("/me/resume",{ bodyLimit: 2_900_000, config: { rateLimit: { max: 5,timeWindow:"1 minute" } } },async request=>{
      const input=parse(resumeUploadSchema,request.body);
      return resume.upload(owner(request),input);
    });
    protectedApp.post("/me/resume/confirm",async request=>{
      const input=parse(resumeConfirmSchema,request.body);
      return resume.confirm(owner(request),input.version,input.resumeId,input.skillNames);
    });
    protectedApp.post("/me/onboarding/advance",async request=>{
      const input=parse(advanceSchema,request.body);
      return state.advance(owner(request),input.version,input.step);
    });
    protectedApp.post("/me/onboarding/complete",async request=>{
      const input=parse(completionSchema,request.body);
      return state.complete(owner(request),input.version);
    });
    await registerLearningRoutes(protectedApp,pool,commerceConfig.entitlementKey,commerceConfig.learningReasoning);
    await registerContinuationRoutes(protectedApp,pool,commerceConfig.learningReasoning,commerceConfig.continuation);
  });
}
