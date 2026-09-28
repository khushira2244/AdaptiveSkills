import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().trim().min(1).default("127.0.0.1"),
  PORT: z.string().regex(/^\d+$/, "Must be a decimal port number")
    .transform(Number).pipe(z.number().int().min(1).max(65535)).default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  WEB_ORIGINS: z.string().trim().default("http://localhost:5173,http://127.0.0.1:5173")
    .transform(value => value.split(",").map(origin => origin.trim()).filter(Boolean))
    .pipe(z.array(z.url()).max(20)),
  AUTH_SECRET: z.string().min(32).max(512).refine(v => !v.startsWith("REPLACE_"), "Replace the AUTH_SECRET placeholder").optional(),
  RESUME_STORAGE_DIR: z.string().min(1).optional(),
  REVENUECAT_WEBHOOK_AUTH_TOKEN: z.string().min(16).max(512).optional(),
  REVENUECAT_SECRET_API_KEY: z.string().min(16).max(512).optional(),
  REVENUECAT_PROJECT_ID: z.string().regex(/^proj[a-zA-Z0-9]+$/).optional(),
  REVENUECAT_ENTITLEMENT_ID: z.string().trim().min(1).max(200).default("adaptive_labs_pro"),
  REVENUECAT_OFFERING_ID: z.string().trim().min(1).max(200).default("default"),
  REVENUECAT_CONTINUATION_OFFERING_ID: z.string().trim().min(1).max(200).default("continuation"),
  REVENUECAT_CONTINUATION_PACKAGE_ID: z.string().trim().min(1).max(200).default("growth_runway"),
  REVENUECAT_CONTINUATION_ENTITLEMENT_ID: z.string().trim().min(1).max(200).default("adaptive_labs_growth"),
  REVENUECAT_CONTINUATION_PRODUCT_ID: z.string().trim().min(1).max(200).default("adaptive_labs_growth_799"),
  OPENAI_API_KEY: z.string().trim().min(20).max(512).optional(),
  OPENAI_MODEL: z.string().trim().min(1).max(100).default("gpt-5-mini"),
  OPENAI_REASONING_TIMEOUT_MS: z.string().regex(/^\d+$/, "Must be milliseconds")
    .transform(Number).pipe(z.number().int().min(10_000).max(180_000)).default(90_000),
  OPENAI_REASONING_MAX_RETRIES: z.string().regex(/^\d+$/, "Must be a retry count")
    .transform(Number).pipe(z.number().int().min(0).max(3)).default(1),
  DATABASE_URL: z.string().refine((value) => {
    try {
      // WHATWG URL rejects PostgreSQL's valid hostless socket form (`@/db`).
      // Insert a validation-only hostname; node-postgres still receives the
      // original URL and uses the `host=/cloudsql/...` query parameter.
      const hostlessSocket = /^(postgres(?:ql)?:\/\/[^/?#]*@)\/(?=[^/])/i.test(value);
      const parsedValue = hostlessSocket
        ? value.replace(/^(postgres(?:ql)?:\/\/[^/?#]*@)\/(?=[^/])/i, "$1localhost/")
        : value;
      const url = new URL(parsedValue);
      if (!["postgres:", "postgresql:"].includes(url.protocol)) return false;

      const hasDatabase = url.pathname.length > 1;
      const hasTcpHost = !hostlessSocket && url.hostname.length > 0;
      const socketHost = url.searchParams.get("host");
      const hasCloudSqlSocket = socketHost?.startsWith("/cloudsql/") === true;

      return hasDatabase && (hasTcpHost || hasCloudSqlSocket);
    } catch { return false; }
  }, "Must be a PostgreSQL URL with a TCP host or Cloud SQL socket and database name").optional(),
});

export type Config = z.infer<typeof configSchema>;

export function requireAuthSecret(config: Config): string {
  if (!config.AUTH_SECRET) throw new ConfigurationError(["AUTH_SECRET is required when starting the learner API"]);
  return config.AUTH_SECRET;
}

export function requireDatabaseUrl(config: Config): string {
  if (!config.DATABASE_URL) throw new ConfigurationError(["DATABASE_URL is required for database operations"]);
  return config.DATABASE_URL;
}

export function requireRevenueCatWebhookToken(config: Config): string {
  if (!config.REVENUECAT_WEBHOOK_AUTH_TOKEN) throw new ConfigurationError(["REVENUECAT_WEBHOOK_AUTH_TOKEN is required for RevenueCat webhooks"]);
  return config.REVENUECAT_WEBHOOK_AUTH_TOKEN;
}

export class ConfigurationError extends Error {
  constructor(fields: string[]) {
    super("Invalid configuration: " + fields.join("; "));
    this.name = "ConfigurationError";
  }
}

// This is the only application boundary that reads environment variables.
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigurationError(result.error.issues.map(
      (issue) => issue.path.join(".") + ": " + issue.message,
    ));
  }
  return result.data;
}
