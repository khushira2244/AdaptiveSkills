import type { Pool, PoolClient } from "pg";
import type { Learner, NewLearner, LearnerGoal, NewGoal, TargetProfile,
  NewTargetProfile, ResumeInput, ResumeState } from "./models.js";

type Connection = Pool | PoolClient;
const learnerColumns = `learner_id AS "learnerId", display_name AS "displayName",
  preferred_interface_language AS "preferredInterfaceLanguage", timezone,
  created_at AS "createdAt", updated_at AS "updatedAt"`;
const profileColumns = `target_profile_id AS "targetProfileId", version, title,
  description, active, created_at AS "createdAt", updated_at AS "updatedAt"`;
const goalColumns = `goal_id AS "goalId", learner_id AS "learnerId", target,
  current_background AS "currentBackground", reason, timeline_days AS "timelineDays",
  industry, specialization, assistance_preference AS "assistancePreference",
  learner_desired_depth AS "learnerDesiredDepth", status,
  target_profile_id AS "targetProfileId", target_profile_version AS "targetProfileVersion",
  target_profile_assigned_at AS "targetProfileAssignedAt",
  created_at AS "createdAt", updated_at AS "updatedAt"`;
const resumeColumns = `learner_id AS "learnerId", state, goal_id AS "goalId",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

// Pass a transaction client when composing writes. These do not implement goal policy or auth.
export function repositories(db: Connection) {
  return {
    async createLearner(input: NewLearner = {}): Promise<Learner> {
      const result = await db.query<Learner>(`INSERT INTO learners
        (display_name, preferred_interface_language, timezone) VALUES ($1, $2, $3)
        RETURNING ${learnerColumns}`,
      [input.displayName ?? null, input.preferredInterfaceLanguage ?? null, input.timezone ?? null]);
      return result.rows[0]!;
    },
    async getLearner(learnerId: string): Promise<Learner | null> {
      const result = await db.query<Learner>(
        `SELECT ${learnerColumns} FROM learners WHERE learner_id = $1`, [learnerId]);
      return result.rows[0] ?? null;
    },
    async createTargetProfile(input: NewTargetProfile): Promise<TargetProfile> {
      const result = await db.query<TargetProfile>(`INSERT INTO target_profiles
        (target_profile_id, version, title, description, active) VALUES ($1, $2, $3, $4, $5)
        RETURNING ${profileColumns}`,
      [input.targetProfileId, input.version, input.title, input.description, input.active]);
      return result.rows[0]!;
    },
    async getTargetProfile(id: string, version: string): Promise<TargetProfile | null> {
      const result = await db.query<TargetProfile>(`SELECT ${profileColumns} FROM target_profiles
        WHERE target_profile_id = $1 AND version = $2`, [id, version]);
      return result.rows[0] ?? null;
    },
    async createGoal(input: NewGoal): Promise<LearnerGoal> {
      const result = await db.query<LearnerGoal>(`INSERT INTO learner_goals
        (learner_id, target, current_background, reason, timeline_days, industry, specialization,
         assistance_preference, learner_desired_depth, status, target_profile_id, target_profile_version)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING ${goalColumns}`,
      [input.learnerId, input.target, input.currentBackground ?? null, input.reason ?? null,
        input.timelineDays ?? null, input.industry ?? null, input.specialization ?? null,
        input.assistancePreference ?? null, input.learnerDesiredDepth ?? null,
        input.status, input.targetProfileId, input.targetProfileVersion]);
      return result.rows[0]!;
    },
    async getGoal(learnerId: string, goalId: string): Promise<LearnerGoal | null> {
      const result = await db.query<LearnerGoal>(`SELECT ${goalColumns} FROM learner_goals
        WHERE learner_id = $1 AND goal_id = $2`, [learnerId, goalId]);
      return result.rows[0] ?? null;
    },
    async getActiveGoal(learnerId: string): Promise<LearnerGoal | null> {
      const result = await db.query<LearnerGoal>(`SELECT ${goalColumns} FROM learner_goals
        WHERE learner_id = $1 AND status = 'active'`, [learnerId]);
      return result.rows[0] ?? null;
    },
    async saveResume(input: ResumeInput): Promise<ResumeState> {
      const result = await db.query<ResumeState>(`INSERT INTO learner_resume_states
        (learner_id, state, goal_id) VALUES ($1, $2, $3)
        ON CONFLICT (learner_id) DO UPDATE SET state = EXCLUDED.state, goal_id = EXCLUDED.goal_id
        RETURNING ${resumeColumns}`, [input.learnerId, input.state, input.goalId]);
      return result.rows[0]!;
    },
    async getResume(learnerId: string): Promise<ResumeState | null> {
      const result = await db.query<ResumeState>(`SELECT ${resumeColumns} FROM learner_resume_states
        WHERE learner_id = $1`, [learnerId]);
      return result.rows[0] ?? null;
    },
  };
}
