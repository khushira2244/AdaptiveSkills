import { createDatabase } from "@adaptive-labs/db";
import { loadConfig, requireDatabaseUrl, ConfigurationError } from "./config.js";

try {
  const pool=createDatabase(requireDatabaseUrl(loadConfig()));
  pool.on("error",()=>console.error("Database connection failed"));
  try {
    const result=await pool.query("SELECT current_database() AS database, current_user AS role");
    console.log("Connected:",result.rows[0].database,"as",result.rows[0].role);
  } finally { await pool.end(); }
} catch(error) {
  console.error(error instanceof ConfigurationError ? error.message : "Database connection check failed");
  process.exitCode=1;
}
