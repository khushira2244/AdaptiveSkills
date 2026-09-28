import type { FastifyInstance,FastifyRequest } from "fastify";
import { setupContextPutSchema,setupRevisionSchema,learningScopePutSchema,jdDocumentUploadSchema,jdDocumentTextSchema,lessonProgressPutSchema,unitTeachingSchema,learningUnitSchema } from "@adaptive-labs/contracts";
import type { Database } from "@adaptive-labs/db";
import type { ZodType } from "zod";
import { HttpError } from "../http-error.js";
import { LearningSetupService } from "./service.js";
import type { LearningReasoningProvider } from "./reasoning.js";

function owner(request:FastifyRequest){if(!request.identity) throw new HttpError(401,"UNAUTHORIZED","Authentication required");return request.identity.learnerId;}
function parsed<T>(schema:ZodType<T>,body:unknown):T{
  const result=schema.safeParse(body);if(!result.success) throw new HttpError(400,"INVALID_INPUT","Invalid request fields: "+result.error.issues.map(i=>i.path.join(".")||"body").join(", "));return result.data;
}
export async function registerLearningRoutes(app:FastifyInstance,pool:Database,entitlementKey:string,reasoning:LearningReasoningProvider|null){
  const service=new LearningSetupService(pool,entitlementKey,reasoning);
  app.post("/me/paid-setup/start",async request=>service.start(owner(request)));
  app.get("/me/paid-setup",async request=>service.read(owner(request)));
  app.put("/me/paid-setup/context",async request=>{const x=parsed(setupContextPutSchema,request.body);return service.saveContext(owner(request),x.revision,x);});
  app.post("/me/paid-setup/jd-document",{bodyLimit:2_900_000,config:{rateLimit:{max:5,timeWindow:"1 minute"}}},async request=>{
    const x=parsed(jdDocumentUploadSchema,request.body);
    return jdDocumentTextSchema.parse(await service.readJdDocument(owner(request),x));
  });
  app.post("/me/learning-scope/propose",async request=>{const x=parsed(setupRevisionSchema,request.body);return service.propose(owner(request),x.revision);});
  app.get("/me/learning-map",async request=>(await service.read(owner(request))).learningMap);
  app.put("/me/learning-scope",async request=>{const x=parsed(learningScopePutSchema,request.body);return service.select(owner(request),x.revision,x.items);});
  app.post("/me/learning-scope/confirm",async request=>{const x=parsed(setupRevisionSchema,request.body);return service.confirm(owner(request),x.revision);});
  app.post("/me/learning-units/generate",async request=>{const x=parsed(setupRevisionSchema,request.body);return service.generate(owner(request),x.revision);});
  app.get("/me/learning-units",async request=>learningUnitSchema.array().parse(await service.readLearningUnits(owner(request))));
  app.post("/me/learning-units/:unitId/teaching/open",async request=>unitTeachingSchema.parse(await service.openUnitTeaching(owner(request),(request.params as {unitId:string}).unitId)));
  app.get("/me/learning-units/:unitId/teaching",async request=>{const value=await service.readUnitTeaching(owner(request),(request.params as {unitId:string}).unitId);if(!value)throw new HttpError(404,"TEACHING_NOT_GENERATED","Open this unit to generate its teaching content");return unitTeachingSchema.parse(value);});
  app.put("/me/concept-lessons/:lessonId/progress",async request=>service.saveLessonProgress(owner(request),(request.params as {lessonId:string}).lessonId,parsed(lessonProgressPutSchema,request.body)));
}
