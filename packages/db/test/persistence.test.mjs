import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createDatabase, migrate, repositories, withTransaction } from "../dist/index.js";
import { loadConfig, requireDatabaseUrl } from "../../../services/api/dist/src/config.js";
import { createApp } from "../../../services/api/dist/src/app.js";

const connectionString = requireDatabaseUrl(loadConfig());
const migrationNames = (await readdir(new URL("../migrations/", import.meta.url))).filter(n => n.endsWith(".sql")).sort();
const sqlState = (expected) => (error) => error?.code === expected;
async function removeMigrationFixture(directory) {
  assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
  assert.ok(basename(directory).startsWith("adaptive-migrations-"));
  await rm(directory, { recursive: true, force: true });
}

test("PostgreSQL persistence foundation", async (t) => {
  const admin = createDatabase(connectionString);
  const schema = "part2_" + randomUUID().replaceAll("-", "");
  await admin.query('CREATE SCHEMA "' + schema + '"');
  const isolatedUrl = new URL(connectionString);
  isolatedUrl.searchParams.set("options", "-c search_path=" + schema + ",public");
  const pool = createDatabase(isolatedUrl.toString());
  t.after(async () => {
    await pool.end();
    // Only this test's randomly named schema is removed.
    await admin.query('DROP SCHEMA "' + schema + '" CASCADE');
    await admin.end();
  });
  const repo = repositories(pool);
  let learner, goal, profile;

  await t.test("concurrent and repeated migrations apply exactly once", async () => {
    const runs = await Promise.all([migrate(pool), migrate(pool)]);
    assert.equal(runs.flat().length, migrationNames.length);
    assert.deepEqual(await migrate(pool), []);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM schema_migrations")).rows[0].n, migrationNames.length);
  });

  await t.test("learner identity and profile fields round-trip", async () => {
    learner = await repo.createLearner({
      displayName: "Learner ' one", preferredInterfaceLanguage: "en", timezone: "Asia/Calcutta",
    });
    assert.deepEqual(await repo.getLearner(learner.learnerId), learner);
    assert.equal(await repo.getLearner(randomUUID()), null);
    assert.equal(await repo.getResume(learner.learnerId), null);
  });

  await t.test("versioned profile reference and all goal fields persist", async () => {
    profile = await repo.createTargetProfile({
      targetProfileId: "TEST_PROFILE", version: "v1", title: "Test target",
      description: "Integration fixture, not production seed", active: true,
    });
    assert.deepEqual(await repo.getTargetProfile("TEST_PROFILE", "v1"), profile);
    goal = await repo.createGoal({
      learnerId: learner.learnerId, target: "AI Application Engineer",
      currentBackground: "Backend Engineer", reason: "Career transition",
      timelineDays: 90, industry: "SaaS", specialization: "AI applications",
      assistancePreference: "GUIDE_ME", learnerDesiredDepth: "PRODUCTION",
      status: "active", targetProfileId: profile.targetProfileId, targetProfileVersion: profile.version,
    });
    assert.deepEqual(await repo.getGoal(learner.learnerId, goal.goalId), goal);
    assert.deepEqual(await repo.getActiveGoal(learner.learnerId), goal);
    assert.equal(goal.timelineDays, 90);
    assert.equal(goal.learnerDesiredDepth, "PRODUCTION");
    assert.ok(goal.targetProfileAssignedAt instanceof Date);
    assert.equal("observedDepth" in goal, false);
  });

  await t.test("one active goal per learner, while paused goals remain allowed", async () => {
    const input = {
      learnerId: learner.learnerId, target: "Another goal", status: "active",
      targetProfileId: profile.targetProfileId, targetProfileVersion: profile.version,
    };
    await assert.rejects(repo.createGoal(input), sqlState("23505"));
    const paused = await repo.createGoal({ ...input, status: "paused" });
    assert.equal(paused.status, "paused");
    assert.equal((await repo.getActiveGoal(learner.learnerId)).goalId, goal.goalId);
  });

  await t.test("foreign keys and owner-scoped reads prevent cross-learner linkage", async () => {
    const other = await repo.createLearner();
    assert.equal(await repo.getGoal(other.learnerId, goal.goalId), null);
    assert.equal(await repo.getActiveGoal(other.learnerId), null);
    await assert.rejects(repo.saveResume({
      learnerId: other.learnerId, state: "TARGET_MAP_REVIEW", goalId: goal.goalId,
    }), sqlState("23503"));
    await assert.rejects(repo.createGoal({
      learnerId: other.learnerId, target: "Missing version", status: "paused",
      targetProfileId: profile.targetProfileId, targetProfileVersion: "missing",
    }), sqlState("23503"));
    await assert.rejects(repo.createGoal({
      learnerId: randomUUID(), target: "Missing learner", status: "paused",
      targetProfileId: profile.targetProfileId, targetProfileVersion: profile.version,
    }), sqlState("23503"));
  });

  await t.test("database checks reject invalid timeline, enums, and resume shapes", async () => {
    for (const [column, value] of [
      ["timeline_days", 0], ["status", "unknown"], ["assistance_preference", "AUTO"],
      ["learner_desired_depth", "EXPERT"],
    ]) {
      await assert.rejects(pool.query(
        "UPDATE learner_goals SET " + column + " = $1 WHERE goal_id = $2",
        [value, goal.goalId]), sqlState("23514"));
    }
    await assert.rejects(repo.saveResume({
      learnerId: learner.learnerId, state: "TARGET_MAP_REVIEW", goalId: null,
    }), sqlState("23514"));
  });

  await t.test("resume upsert preserves creation time and updates modification time", async () => {
    const initial = await repo.saveResume({ learnerId: learner.learnerId, state: "GOAL_SETUP", goalId: null });
    const updated = await repo.saveResume({
      learnerId: learner.learnerId, state: "TARGET_MAP_REVIEW", goalId: goal.goalId,
    });
    assert.deepEqual(updated.createdAt, initial.createdAt);
    assert.ok(updated.updatedAt >= initial.updatedAt);
    assert.deepEqual(await repo.getResume(learner.learnerId), updated);
  });

  await t.test("multi-record failures roll back and release the connection", async () => {
    let rolledBackId;
    await assert.rejects(withTransaction(pool, async (client) => {
      const tx = repositories(client);
      const row = await tx.createLearner({ displayName: "Must roll back" });
      rolledBackId = row.learnerId;
      await tx.saveResume({ learnerId: row.learnerId, state: "GOAL_SETUP", goalId: null });
      throw new Error("intentional rollback");
    }), /intentional rollback/);
    assert.equal(await repo.getLearner(rolledBackId), null);
    assert.equal(await repo.getResume(rolledBackId), null);
    assert.equal((await pool.query("SELECT 1 AS n")).rows[0].n, 1);
  });

  await t.test("applied migration edits are rejected without modifying history", async () => {
    const directory = await mkdtemp(join(tmpdir(), "adaptive-migrations-"));
    try {
      const sql = await readFile(new URL("../migrations/001_day1_foundation.sql", import.meta.url), "utf8");
      await writeFile(join(directory, "001_day1_foundation.sql"), sql + "\n-- altered");
      await assert.rejects(migrate(pool, pathToFileURL(directory + "/")), /missing or changed/);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM schema_migrations")).rows[0].n, migrationNames.length);
    } finally {
      await removeMigrationFixture(directory);
    }
  });

  await t.test("failed migration rolls back schema changes and history atomically", async () => {
    const directory = await mkdtemp(join(tmpdir(), "adaptive-migrations-"));
    try {
      for (const name of migrationNames) {
        await writeFile(join(directory, name), await readFile(new URL("../migrations/" + name, import.meta.url)));
      }
      await writeFile(join(directory, "999_intentional_failure.sql"),
        "CREATE TABLE rollback_probe (id integer); SELECT missing_column FROM rollback_probe;");
      await assert.rejects(migrate(pool, pathToFileURL(directory + "/")), sqlState("42703"));
      assert.equal((await pool.query("SELECT to_regclass('rollback_probe') AS name")).rows[0].name, null);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM schema_migrations")).rows[0].n, migrationNames.length);
    } finally {
      await removeMigrationFixture(directory);
    }
  });

  await t.test("closing and recreating the backend retains persisted goal and resume", async () => {
    const config = loadConfig({ DATABASE_URL: isolatedUrl.toString(), AUTH_SECRET: randomBytes(32).toString("hex"), LOG_LEVEL: "silent" });
    const first = createApp(config);
    await first.ready();
    assert.equal((await first.inject("/health")).statusCode, 200);
    await first.close();
    const second = createApp(config);
    try {
      await second.ready();
      assert.equal((await second.inject("/health")).statusCode, 200);
      const fresh = createDatabase(isolatedUrl.toString());
      try {
        assert.deepEqual(await repositories(fresh).getActiveGoal(learner.learnerId), goal);
        assert.equal((await repositories(fresh).getResume(learner.learnerId)).state, "TARGET_MAP_REVIEW");
      } finally { await fresh.end(); }
    } finally { await second.close(); }
  });
});
