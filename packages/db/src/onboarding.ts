import type { Pool, PoolClient } from "pg";
import type { OnboardingState, Profile, Skill, Goal, Preferences } from "@adaptive-labs/contracts";
type DB = Pool | PoolClient;
export function onboardingRepository(db: DB) {
  return {
    async initialize(learnerId: string) {
      await db.query("INSERT INTO onboarding_states(learner_id) VALUES ($1)", [learnerId]);
      await db.query("INSERT INTO learner_setup_profiles(learner_id) VALUES ($1)", [learnerId]);
      await db.query("INSERT INTO learner_learning_preferences(learner_id) VALUES ($1)", [learnerId]);
    },
    async lock(learnerId: string, write = false) {
      const result = await db.query<{ version: number; completed: boolean; currentStep: OnboardingState["currentStep"] }>(
        'SELECT version, completed, current_step AS "currentStep" FROM onboarding_states WHERE learner_id=$1 FOR ' +
        (write ? "UPDATE" : "SHARE"), [learnerId]);
      return result.rows[0];
    },
    async touch(learnerId: string, step?: string, complete = false) {
      await db.query(`UPDATE onboarding_states SET version=version+1, updated_at=now(),
        current_step=COALESCE($2, current_step), completed=$3,
        completed_at=CASE WHEN $3 THEN now() ELSE NULL END WHERE learner_id=$1`,
        [learnerId, step ?? null, complete]);
    },
    async profile(learnerId: string, patch: Partial<Profile>) {
      if ("displayName" in patch) await db.query("UPDATE learners SET display_name=$2 WHERE learner_id=$1", [learnerId, patch.displayName]);
      if ("currentRole" in patch) await db.query("UPDATE learner_setup_profiles SET role_title=$2 WHERE learner_id=$1", [learnerId, patch.currentRole]);
      if ("experienceYears" in patch) await db.query("UPDATE learner_setup_profiles SET experience_years=$2 WHERE learner_id=$1", [learnerId, patch.experienceYears]);
    },
    async skills(learnerId: string, skills: Skill[]) {
      await db.query("DELETE FROM learner_skill_assessments WHERE learner_id=$1", [learnerId]);
      for (const [position, skill] of skills.entries()) {
        const result = await db.query<{ id: string }>(`INSERT INTO learner_skill_assessments(learner_id,name,source,level,position)
          VALUES($1,$2,$3,$4,$5) RETURNING skill_id AS id`, [learnerId, skill.name, skill.source, skill.level, position]);
        for (const [i, subskill] of skill.subskills.entries()) {
          await db.query("INSERT INTO learner_subskill_assessments(skill_id,name,level,position) VALUES($1,$2,$3,$4)",
            [result.rows[0]!.id, subskill.name, subskill.level, i]);
        }
      }
    },
    async goal(learnerId: string, goal: Goal) {
      await db.query(`INSERT INTO learner_goal_intents(learner_id,target,reason) VALUES($1,$2,$3)
        ON CONFLICT(learner_id) DO UPDATE SET target=$2, reason=$3, updated_at=now()`, [learnerId, goal.target, goal.reason]);
    },
    async interests(learnerId: string, interests: string[]) {
      await db.query("DELETE FROM learner_interests WHERE learner_id=$1", [learnerId]);
      for (const [position, interest] of interests.entries()) await db.query(
        "INSERT INTO learner_interests(learner_id,interest,position) VALUES($1,$2,$3)", [learnerId, interest, position]);
    },
    async preferences(learnerId: string, preferences: Preferences) {
      await db.query("UPDATE learner_learning_preferences SET timeline_days=$2, pace=$3 WHERE learner_id=$1",
        [learnerId, preferences.timelineDays, preferences.pace]);
    },
    async resume(learnerId: string, doc: { resumeId: string; filename: string; mimeType: string; storageKey: string; suggestions: string[] }) {
      const old = await db.query<{ storage_key: string }>("SELECT storage_key FROM learner_resume_documents WHERE learner_id=$1", [learnerId]);
      await db.query(`INSERT INTO learner_resume_documents(resume_id,learner_id,filename,mime_type,storage_key,suggestions)
        VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(learner_id) DO UPDATE SET
        resume_id=$1,filename=$3,mime_type=$4,storage_key=$5,suggestions=$6::jsonb,confirmed=false,created_at=now()`,
        [doc.resumeId, learnerId, doc.filename, doc.mimeType, doc.storageKey, JSON.stringify(doc.suggestions)]);
      return old.rows[0]?.storage_key;
    },
    async confirmResume(learnerId: string, resumeId: string) {
      await db.query("UPDATE learner_resume_documents SET confirmed=true WHERE learner_id=$1 AND resume_id=$2", [learnerId, resumeId]);
    },
    async snapshot(learnerId: string): Promise<OnboardingState> {
      const state = await db.query(`SELECT s.version,s.completed,s.current_step AS "currentStep",
        l.display_name AS "displayName",p.role_title AS "currentRole",p.experience_years::float AS "experienceYears"
        FROM onboarding_states s JOIN learners l USING(learner_id)
        JOIN learner_setup_profiles p USING(learner_id) WHERE learner_id=$1`, [learnerId]);
      const row = state.rows[0]!;
      const skills = await db.query<Skill>(`SELECT s.name,s.source,s.level,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('name',ss.name,'level',ss.level) ORDER BY ss.position)
        FROM learner_subskill_assessments ss WHERE ss.skill_id=s.skill_id),'[]'::jsonb) AS subskills
        FROM learner_skill_assessments s WHERE learner_id=$1 ORDER BY position`, [learnerId]);
      const goal = await db.query<Goal>("SELECT target,reason FROM learner_goal_intents WHERE learner_id=$1", [learnerId]);
      const interests = await db.query<{ interest: string }>("SELECT interest FROM learner_interests WHERE learner_id=$1 ORDER BY position", [learnerId]);
      const preferences = await db.query<Preferences>('SELECT timeline_days AS "timelineDays",pace FROM learner_learning_preferences WHERE learner_id=$1', [learnerId]);
      const resume = await db.query<NonNullable<OnboardingState["resume"]>>(`SELECT resume_id AS "resumeId",filename,
        mime_type AS "mimeType",suggestions,confirmed FROM learner_resume_documents WHERE learner_id=$1`, [learnerId]);
      return {
        learnerId, version: row.version, currentStep: row.currentStep, completed: row.completed,
        profile: { displayName: row.displayName, currentRole: row.currentRole, experienceYears: row.experienceYears },
        skills: skills.rows, goal: goal.rows[0] ?? null, interests: interests.rows.map(r => r.interest),
        preferences: preferences.rows[0]!, resume: resume.rows[0] ?? null,
        nextRoute: row.completed ? "UNPAID_HOME" : "ONBOARDING",
      };
    },
  };
}
