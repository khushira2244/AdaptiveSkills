import assert from "node:assert/strict";
import test from "node:test";
import { apiErrorSchema, healthResponseSchema } from "@adaptive-labs/contracts";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

const config = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" });

test("health succeeds, matches the shared contract, and does not listen", async (t) => {
  const app = createApp(config);
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(healthResponseSchema.parse(response.json()), {
    status: "ok", service: "adaptive-labs-api",
  });
  assert.equal(app.server.listening, false);
});

test("browser CORS allows configured origins without changing API responses", async (t) => {
  const app = createApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", WEB_ORIGINS: "https://adaptive.example" }));
  t.after(() => app.close());
  const allowed = await app.inject({ method: "OPTIONS", url: "/health", headers: { origin: "https://adaptive.example", "access-control-request-method": "GET" } });
  assert.equal(allowed.statusCode, 204);
  assert.equal(allowed.headers["access-control-allow-origin"], "https://adaptive.example");

  const blocked = await app.inject({ method: "GET", url: "/health", headers: { origin: "https://untrusted.example" } });
  assert.equal(blocked.statusCode, 200);
  assert.equal(blocked.headers["access-control-allow-origin"], undefined);
});

test("unknown routes return a stable error with correlated request ID", async (t) => {
  const app = createApp(config);
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/missing" });
  assert.equal(response.statusCode, 404);
  const body = apiErrorSchema.parse(response.json());
  assert.equal(body.error.code, "NOT_FOUND");
  assert.equal(body.error.requestId, response.headers["x-request-id"]);
});

test("unexpected failures hide internal details and retain correlation", async (t) => {
  const app = createApp(config);
  t.after(() => app.close());
  app.get("/test-failure", async () => { throw new Error("private database detail"); });
  const response = await app.inject({ method: "GET", url: "/test-failure" });
  assert.equal(response.statusCode, 500);
  const body = apiErrorSchema.parse(response.json());
  assert.equal(body.error.code, "INTERNAL_ERROR");
  assert.equal(body.error.message, "Internal server error");
  assert.equal(body.error.requestId, response.headers["x-request-id"]);
  assert.doesNotMatch(response.body, /private|stack|database/);
});

test("request validation uses the common error contract", async (t) => {
  const app = createApp(config);
  t.after(() => app.close());
  app.post("/test-validation", {
    schema: { body: { type: "object", required: ["name"], properties: { name: { type: "string" } } } },
  }, async () => ({ ok: true }));
  const response = await app.inject({ method: "POST", url: "/test-validation", payload: {} });
  assert.equal(response.statusCode, 400);
  const body = apiErrorSchema.parse(response.json());
  assert.equal(body.error.code, "BAD_REQUEST");
  assert.equal(body.error.message, "Request validation failed");
});

test("request IDs are unique and cannot be supplied by the caller", async (t) => {
  const app = createApp(config);
  t.after(() => app.close());
  const first = await app.inject({ url: "/health", headers: { "x-request-id": "untrusted" } });
  const second = await app.inject({ url: "/health" });
  assert.match(String(first.headers["x-request-id"]), /^[a-f0-9-]{36}$/);
  assert.notEqual(first.headers["x-request-id"], "untrusted");
  assert.notEqual(first.headers["x-request-id"], second.headers["x-request-id"]);
});
