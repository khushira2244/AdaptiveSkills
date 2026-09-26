import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { withTransaction } from "./database.js";

const defaultDirectory = new URL("../migrations/", import.meta.url);

export async function migrate(pool: Pool, directory: URL = defaultDirectory): Promise<string[]> {
  const names = (await readdir(directory)).filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort();
  const migrations = await Promise.all(names.map(async (name) => {
    const sql = await readFile(new URL(name, directory), "utf8");
    return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  }));
  return withTransaction(pool, async (client) => {
    // Serialize concurrent migration runs, including creation of the history table.
    await client.query("SELECT pg_advisory_xact_lock(814206, 1)");
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const { rows } = await client.query<{ name: string; checksum: string }>(
      "SELECT name, checksum FROM schema_migrations ORDER BY name",
    );
    for (const applied of rows) {
      const source = migrations.find((migration) => migration.name === applied.name);
      if (!source || source.checksum !== applied.checksum) {
        throw new Error("Applied migration is missing or changed: " + applied.name);
      }
    }
    const appliedNames = new Set(rows.map((row) => row.name));
    const lastApplied = rows.at(-1)?.name;
    const added: string[] = [];
    for (const migration of migrations) {
      if (appliedNames.has(migration.name)) continue;
      if (lastApplied && migration.name < lastApplied) {
        throw new Error("Migration added before existing history: " + migration.name);
      }
      await client.query(migration.sql);
      await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
        [migration.name, migration.checksum]);
      added.push(migration.name);
    }
    return added;
  });
}
