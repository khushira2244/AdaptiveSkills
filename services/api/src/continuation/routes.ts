import type { FastifyInstance,FastifyRequest } from "fastify";
import { evidenceCreateSchema,hintRequestSchema,labAutosaveSchema,labRunSchema,labSubmitSchema,markedWordCreateSchema,markerCreateSchema,noteCreateSchema,purchaseIntentSchema,purchaseOutcomeSchema,systemAssistanceSchema } from "@adaptive-labs/contracts";
import type { Database } from "@adaptive-labs/db";
import type { z } from "zod";
import { HttpError } from "../http-error.js";
import type { LearningReasoningProvider } from "../learning/reasoning.js";
import { ContinuationService } from "./service.js";
import { RevenueCatCustomerService } from "../commerce/service.js";

function owner(request:FastifyRequest){if(!request.identity)throw new HttpError(401,"UNAUTHORIZED","Authentication required");return request.identity.learnerId;}
function parse<T>(schema:z.ZodType<T>,body:unknown){const result=schema.safeParse(body);if(!result.success)throw new HttpError(400,"INVALID_INPUT","Invalid request fields: "+result.error.issues.map(x=>x.path.join(".")||"body").join(", "));return result.data;}
export async function registerContinuationRoutes(app:FastifyInstance,pool:Database,reasoning:LearningReasoningProvider|null,commerce:{offeringId:string;packageId:string;entitlementKey:string;productId:string;secretApiKey?:string;projectId?:string}){const service=new ContinuationService(pool,reasoning,commerce);const revenueCat=new RevenueCatCustomerService(pool,commerce.entitlementKey,commerce.secretApiKey,commerce.projectId);
  app.get("/me/learning-continuation",request=>service.state(owner(request)));
  app.get("/me/labs",request=>service.listLabs(owner(request)));
  app.post("/me/learning-notes",request=>service.addNote(owner(request),parse(noteCreateSchema,request.body)));
  app.get("/me/learning-notes",request=>service.listNotes(owner(request),String((request.query as {q?:string}).q??"")));
  app.post("/me/learning-markers",request=>service.addMarker(owner(request),parse(markerCreateSchema,request.body)));
  app.post("/me/marked-words",request=>service.addMarkedWord(owner(request),parse(markedWordCreateSchema,request.body)));
  app.get("/me/marked-words",request=>service.listMarkedWords(owner(request),String((request.query as {q?:string}).q??"")));
  app.post("/me/learning-units/:unitId/complete",request=>service.completeUnit(owner(request),(request.params as {unitId:string}).unitId));
  app.post("/me/learning-doubts/:doubtId/resolve",request=>service.resolveDoubt(owner(request),(request.params as {doubtId:string}).doubtId));
  app.get("/me/learning-doubts",request=>service.listDoubts(owner(request)));
  app.post("/me/labs/:labId/start",request=>service.startLab(owner(request),(request.params as {labId:string}).labId));
  app.get("/me/labs/:labId",request=>service.getLab(owner(request),(request.params as {labId:string}).labId));
  app.put("/me/labs/draft",request=>service.autosave(owner(request),parse(labAutosaveSchema,request.body)));
  app.post("/me/labs/run",request=>service.runLab(owner(request),parse(labRunSchema,request.body).attemptId));
  app.post("/me/labs/hints",request=>{const input=parse(hintRequestSchema,request.body);return service.hint(owner(request),input.attemptId,input.fileId);});
  app.post("/me/labs/system-assistance",request=>service.systemAssistance(owner(request),parse(systemAssistanceSchema,request.body).attemptId));
  app.post("/me/labs/evidence",request=>service.evidence(owner(request),parse(evidenceCreateSchema,request.body)));
  app.post("/me/labs/submit",request=>service.submitLab(owner(request),parse(labSubmitSchema,request.body).attemptId));
  app.post("/me/labs/:labId/complete",request=>service.completeLab(owner(request),(request.params as {labId:string}).labId));
  app.post("/me/learning-continuation/analyze",request=>service.analyze(owner(request)));
  app.post("/me/learning-continuation/purchase-intent",request=>{const input=parse(purchaseIntentSchema,request.body);return service.purchaseIntent(owner(request),input.platform,input.countryCode??null);});
  app.post("/me/learning-continuation/purchase-outcome",request=>{const input=parse(purchaseOutcomeSchema,request.body);return service.purchaseOutcome(owner(request),input.purchaseAttemptId,input.outcome,input.errorCode??null);});
  app.post("/me/learning-continuation/reconcile-purchase",async request=>{const id=owner(request);const verified=await revenueCat.reconcileEntitlement(id,commerce.entitlementKey,commerce.productId);if(!verified.active)throw new HttpError(403,"PURCHASE_NOT_VERIFIED","The growth entitlement is not active");return service.reconcileNextPurchase(id);});
}
