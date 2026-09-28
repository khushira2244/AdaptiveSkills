import { onboardingRepository, withTransaction, type Database, type Transaction } from "@adaptive-labs/db";
import { onboardingStateSchema, onboardingSteps, type OnboardingState, type Profile, type Skill, type Goal, type Preferences } from "@adaptive-labs/contracts";
import { HttpError } from "../http-error.js";

function validateStep(state: OnboardingState, step: OnboardingState["currentStep"]) {
  const missing =
    step === "profile" ? !state.profile.displayName :
    step === "role" ? !state.profile.currentRole :
    step === "experience" ? state.profile.experienceYears === null :
    step === "skills" ? state.skills.some(s => !s.level || s.subskills.some(sub => !sub.level)) :
    step === "goal" ? !state.goal?.target :
    step === "preferences" ? !state.preferences.timelineDays || !state.preferences.pace : false;
  if (missing) throw new HttpError(422,"INCOMPLETE_STEP","Complete the " + step + " step before continuing");
}
export class OnboardingStateService {
  constructor(private readonly pool: Database) {}
  async read(learnerId: string) {
    return withTransaction(this.pool, async client => {
      const repo = onboardingRepository(client);
      if (!await repo.lock(learnerId)) throw new HttpError(404,"NOT_FOUND","Learner setup not found");
      return onboardingStateSchema.parse(await repo.snapshot(learnerId));
    });
  }
  async mutate(learnerId: string, version: number, write: (client: Transaction, state: OnboardingState) => Promise<void>,
    nextStep?: OnboardingState["currentStep"], complete = false, allowCompleted = false) {
    return withTransaction(this.pool, async client => {
      const repo = onboardingRepository(client);
      const locked = await repo.lock(learnerId,true);
      if (!locked) throw new HttpError(404,"NOT_FOUND","Learner setup not found");
      if (locked.version !== version) throw new HttpError(409,"STALE_VERSION","Reload onboarding before saving");
      if (locked.completed && !allowCompleted) throw new HttpError(409,"ONBOARDING_COMPLETE","Onboarding is already complete");
      const state = await repo.snapshot(learnerId);
      await write(client,state);
      if(locked.completed) await client.query("UPDATE onboarding_states SET version=version+1,updated_at=now() WHERE learner_id=$1",[learnerId]);
      else await repo.touch(learnerId,nextStep,complete);
      return onboardingStateSchema.parse(await repo.snapshot(learnerId));
    });
  }
  async advance(learnerId: string, version: number, step: OnboardingState["currentStep"]) {
    const index = onboardingSteps.indexOf(step);
    if (index >= onboardingSteps.indexOf("review")) throw new HttpError(422,"INVALID_STEP","Use the completion endpoint after review");
    return this.mutate(learnerId,version,async (_client,state) => {
      if (state.currentStep !== step) throw new HttpError(409,"INVALID_STEP","Only the current step can advance");
      validateStep(state,step);
    },onboardingSteps[index+1]!);
  }
  async complete(learnerId: string, version: number) {
    const existing = await this.read(learnerId);
    if (existing.completed) return existing; // A retried completion is idempotent.
    return this.mutate(learnerId,version,async (_client,state) => {
      if (state.currentStep !== "review") throw new HttpError(422,"INCOMPLETE_ONBOARDING","Finish the onboarding steps before review");
      for (const step of onboardingSteps) validateStep(state,step);
    },"complete",true);
  }
}
export class LearnerProfileService {
  constructor(private state: OnboardingStateService) {}
  save(id: string, version: number, profile: Partial<Profile>) {
    return this.state.mutate(id,version,async client => onboardingRepository(client).profile(id,profile),undefined,false,true);
  }
}
export class SkillProfileService {
  constructor(private state: OnboardingStateService) {}
  save(id: string, version: number, skills: Skill[]) {
    return this.state.mutate(id,version,async client => onboardingRepository(client).skills(id,skills));
  }
}
export class GoalService {
  constructor(private state: OnboardingStateService) {}
  save(id: string, version: number, goal: Goal) {
    return this.state.mutate(id,version,async client => onboardingRepository(client).goal(id,goal));
  }
}
export class InterestService {
  constructor(private state: OnboardingStateService) {}
  save(id: string, version: number, interests: string[]) {
    return this.state.mutate(id,version,async client => onboardingRepository(client).interests(id,interests));
  }
}
export class LearningPreferenceService {
  constructor(private state: OnboardingStateService) {}
  save(id: string, version: number, preferences: Preferences) {
    return this.state.mutate(id,version,async client => onboardingRepository(client).preferences(id,preferences),undefined,false,true);
  }
}
