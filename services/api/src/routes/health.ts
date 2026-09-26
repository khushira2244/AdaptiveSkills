import type { FastifyInstance } from "fastify";
import { healthResponseSchema, type HealthResponse } from "@adaptive-labs/contracts";

export function registerHealthRoute(app: FastifyInstance): void {
  const response: HealthResponse = healthResponseSchema.parse({
    status: "ok",
    service: "adaptive-labs-api",
  });
  app.get("/health", async () => response);
}
