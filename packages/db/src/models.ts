// Persistence models only. Public request/response contracts belong to later parts.
export type AssistancePreference = "GUIDE_ME" | "BALANCED" | "MINIMAL_HELP";
export type DesiredDepth = "AWARE" | "WORKING" | "PRODUCTION" | "DEEP";
export type GoalStatus = "active" | "paused" | "completed" | "archived";

export interface Learner {
  learnerId: string;
  displayName: string | null;
  preferredInterfaceLanguage: string | null;
  timezone: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface NewLearner {
  displayName?: string;
  preferredInterfaceLanguage?: string;
  timezone?: string;
}
export interface TargetProfile {
  targetProfileId: string;
  version: string;
  title: string;
  description: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}
export interface NewTargetProfile {
  targetProfileId: string;
  version: string;
  title: string;
  description: string;
  active: boolean;
}
export interface NewGoal {
  learnerId: string;
  target: string;
  currentBackground?: string;
  reason?: string;
  timelineDays?: number;
  industry?: string;
  specialization?: string;
  assistancePreference?: AssistancePreference;
  learnerDesiredDepth?: DesiredDepth;
  status: GoalStatus;
  targetProfileId: string;
  targetProfileVersion: string;
}
export interface LearnerGoal {
  goalId: string;
  learnerId: string;
  target: string;
  currentBackground: string | null;
  reason: string | null;
  timelineDays: number | null;
  industry: string | null;
  specialization: string | null;
  assistancePreference: AssistancePreference | null;
  learnerDesiredDepth: DesiredDepth | null;
  status: GoalStatus;
  targetProfileId: string;
  targetProfileVersion: string;
  targetProfileAssignedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
export type ResumeInput =
  | { learnerId: string; state: "GOAL_SETUP"; goalId: null }
  | { learnerId: string; state: "TARGET_MAP_REVIEW"; goalId: string };
export type ResumeState = ResumeInput & { createdAt: Date; updatedAt: Date };
