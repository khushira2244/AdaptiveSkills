import assert from "node:assert/strict";
import test from "node:test";
import { ConfigurationError, loadConfig, requireDatabaseUrl, requireAuthSecret } from "../src/config.js";

test("local defaults require no secrets or database", () => {
  assert.deepEqual(loadConfig({}), {
    NODE_ENV: "development", HOST: "127.0.0.1", PORT: 3000, LOG_LEVEL: "info",
    REVENUECAT_ENTITLEMENT_ID: "adaptive_labs_pro",
    REVENUECAT_OFFERING_ID: "default",
    REVENUECAT_CONTINUATION_OFFERING_ID:"continuation",REVENUECAT_CONTINUATION_PACKAGE_ID:"growth_runway",
    REVENUECAT_CONTINUATION_ENTITLEMENT_ID:"adaptive_labs_growth",REVENUECAT_CONTINUATION_PRODUCT_ID:"adaptive_labs_growth_799",
    OPENAI_MODEL: "gpt-5-mini",
    OPENAI_REASONING_TIMEOUT_MS: 90_000,
    OPENAI_REASONING_MAX_RETRIES: 1,
  });
});

test("valid environment configuration is parsed", () => {
  assert.deepEqual(loadConfig({
    NODE_ENV: "production", HOST: "0.0.0.0", PORT: "8080", LOG_LEVEL: "warn",
  }), { NODE_ENV: "production", HOST: "0.0.0.0", PORT: 8080, LOG_LEVEL: "warn",
    REVENUECAT_ENTITLEMENT_ID: "adaptive_labs_pro", REVENUECAT_OFFERING_ID: "default",
    REVENUECAT_CONTINUATION_OFFERING_ID:"continuation",REVENUECAT_CONTINUATION_PACKAGE_ID:"growth_runway",
    REVENUECAT_CONTINUATION_ENTITLEMENT_ID:"adaptive_labs_growth",REVENUECAT_CONTINUATION_PRODUCT_ID:"adaptive_labs_growth_799",OPENAI_MODEL: "gpt-5-mini",
    OPENAI_REASONING_TIMEOUT_MS:90_000,OPENAI_REASONING_MAX_RETRIES:1 });
});

test("OpenAI timeout and retry bounds are validated",()=>{
  assert.equal(loadConfig({OPENAI_REASONING_TIMEOUT_MS:"120000",OPENAI_REASONING_MAX_RETRIES:"2"}).OPENAI_REASONING_TIMEOUT_MS,120000);
  for(const env of [{OPENAI_REASONING_TIMEOUT_MS:"0"},{OPENAI_REASONING_TIMEOUT_MS:"999999"},{OPENAI_REASONING_MAX_RETRIES:"4"}])
    assert.throws(()=>loadConfig(env),ConfigurationError);
});

for (const port of ["", "abc", "1.5", "-1", "0", "65536", "1e3"]) {
  test("invalid port is rejected: " + JSON.stringify(port), () => {
    assert.throws(() => loadConfig({ PORT: port }), (error: unknown) =>
      error instanceof ConfigurationError && error.message.includes("PORT"));
  });
}

for (const env of [{ HOST: " " }, { NODE_ENV: "invalid" }, { LOG_LEVEL: "invalid" }]) {
  test("invalid configuration field is identified: " + Object.keys(env)[0], () => {
    assert.throws(() => loadConfig(env), (error: unknown) =>
      error instanceof ConfigurationError && error.message.includes(Object.keys(env)[0]!));
  });
}

test("configuration error does not echo a supplied value", () => {
  assert.throws(() => loadConfig({ PORT: "private-value" }), (error: unknown) =>
    error instanceof ConfigurationError && !error.message.includes("private-value"));
});

test("database operations require an explicit URL", () => {
  assert.throws(() => requireDatabaseUrl(loadConfig({})), ConfigurationError);
});

test("authentication needs a non-placeholder secret; invalid values are not echoed", () => {
  assert.throws(() => requireAuthSecret(loadConfig({})), ConfigurationError);
  for (const value of ["short-secret", "REPLACE_WITH_A_SEPARATE_RANDOM_SECRET"]) {
    assert.throws(() => loadConfig({ AUTH_SECRET: value }), (error: unknown) =>
      error instanceof ConfigurationError && !error.message.includes(value));
  }
});

test("PostgreSQL URLs are accepted and invalid URLs do not disclose credentials", () => {
  const url = "postgresql://localhost/adaptive_labs";
  assert.equal(requireDatabaseUrl(loadConfig({ DATABASE_URL: url })), url);
  for (const value of ["invalid-private-value", "https://user:private@localhost/db", "postgresql://localhost"]) {
    assert.throws(() => loadConfig({ DATABASE_URL: value }), (error: unknown) =>
      error instanceof ConfigurationError && error.message.includes("DATABASE_URL")
        && !error.message.includes("private"));
  }
});
