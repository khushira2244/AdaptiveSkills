import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { createDatabase } from "@adaptive-labs/db";
import { requireAuthSecret, type Config } from "./config.js";
import { registerLearnerRoutes } from "./onboarding/routes.js";
import { registerErrorHandling } from "./errors.js";
import { registerHealthRoute } from "./routes/health.js";
import { OpenAILearningReasoningProvider,type LearningReasoningProvider } from "./learning/reasoning.js";

export function createApp(config: Config,dependencies:{learningReasoning?:LearningReasoningProvider}={}) {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL, redact: ["req.headers.authorization", "req.body.password", "res.body.token"] },
    bodyLimit: 65536,
    // Generate our own IDs; untrusted client headers cannot control log correlation.
    requestIdHeader: false,
    genReqId: () => randomUUID(),
  });
  app.register(cors, {
    origin: config.WEB_ORIGINS,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    exposedHeaders: ["x-request-id"],
    maxAge: 86400,
  });
  if (config.DATABASE_URL) {
    const secret = requireAuthSecret(config);
    const database = createDatabase(config.DATABASE_URL);
    database.on("error", () => app.log.error("Database connection failed"));
    app.decorate("database", database);
    app.addHook("onReady", async () => { await database.query("SELECT 1"); });
    app.addHook("onClose", async () => { await database.end(); });
    app.register(async learnerApp => {
      await registerLearnerRoutes(learnerApp,database,secret,config.RESUME_STORAGE_DIR ?? ".data/resumes",{
        entitlementKey:config.REVENUECAT_ENTITLEMENT_ID,
        offeringId:config.REVENUECAT_OFFERING_ID,
        continuation:{offeringId:config.REVENUECAT_CONTINUATION_OFFERING_ID,packageId:config.REVENUECAT_CONTINUATION_PACKAGE_ID,entitlementKey:config.REVENUECAT_CONTINUATION_ENTITLEMENT_ID,productId:config.REVENUECAT_CONTINUATION_PRODUCT_ID,...(config.REVENUECAT_SECRET_API_KEY?{secretApiKey:config.REVENUECAT_SECRET_API_KEY}:{}),...(config.REVENUECAT_PROJECT_ID?{projectId:config.REVENUECAT_PROJECT_ID}:{})},
        ...(config.REVENUECAT_WEBHOOK_AUTH_TOKEN ? { webhookToken:config.REVENUECAT_WEBHOOK_AUTH_TOKEN } : {}),
        ...(config.REVENUECAT_SECRET_API_KEY ? { secretApiKey:config.REVENUECAT_SECRET_API_KEY } : {}),
        ...(config.REVENUECAT_PROJECT_ID ? { projectId:config.REVENUECAT_PROJECT_ID } : {}),
        learningReasoning:dependencies.learningReasoning??(config.OPENAI_API_KEY?new OpenAILearningReasoningProvider(config.OPENAI_API_KEY,config.OPENAI_MODEL,{
          timeoutMs:config.OPENAI_REASONING_TIMEOUT_MS,
          maxRetries:config.OPENAI_REASONING_MAX_RETRIES,
          log:(level,event)=>app.log[level](event,"OpenAI reasoning"),
        }):null),
      });
    });
  }
  app.log.info({
    openAiApiKeyPresent:Boolean(config.OPENAI_API_KEY),
    openAiModel:config.OPENAI_MODEL,
    openAiReasoningTimeoutMs:config.OPENAI_REASONING_TIMEOUT_MS,
    openAiReasoningMaxRetries:config.OPENAI_REASONING_MAX_RETRIES,
  },"AI runtime configuration");
  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });
  registerErrorHandling(app);
  registerHealthRoute(app);
  return app;
}
