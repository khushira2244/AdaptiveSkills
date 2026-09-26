import { createDatabase, migrate } from "@adaptive-labs/db";
import { ConfigurationError, loadConfig, requireDatabaseUrl } from "./config.js";

try {
  const pool = createDatabase(requireDatabaseUrl(loadConfig()));
  pool.on("error", () => console.error("Database connection failed"));
  try {
    const applied = await migrate(pool);
    console.log(applied.length ? "Applied: " + applied.join(", ") : "Database migrations are current");
  } finally {
    await pool.end();
  }
} catch (error) {
  // Connection errors may include credentials or database details; do not echo them.
  console.error(error instanceof ConfigurationError ? error.message : "Database migration failed");
  process.exitCode = 1;
}
