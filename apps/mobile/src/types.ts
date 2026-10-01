export type Step = "profile" | "role" | "experience" | "resume" | "skills" | "goal" | "interests" | "preferences" | "review" | "complete";
export type Level = "AWARE" | "WORKING" | "PRODUCTION" | "DEEP";
export type Pace = "CASUAL" | "STEADY" | "INTENSIVE";

export type Skill = {
  name: string;
  source: "MANUAL" | "CV_CONFIRMED";
  level: Level | null;
  subskills: { name: string; level: Level | null }[];
};

export type OnboardingState = {
  learnerId: string;
  version: number;
  currentStep: Step;
  completed: boolean;
  profile: { displayName: string | null; currentRole: string | null; experienceYears: number | null };
  resume: { resumeId: string; filename: string; mimeType: string; suggestions: string[]; confirmed: boolean } | null;
  skills: Skill[];
  goal: { target: string; reason: string | null } | null;
  interests: string[];
  preferences: { timelineDays: number | null; pace: Pace | null };
  nextRoute: "ONBOARDING" | "UNPAID_HOME";
};

export type Session = { token: string; expiresAt: string; learnerId: string };

export type HomeState = {
  state: "PROFILE_COMPLETE_UNPAID" | "PURCHASE_IN_PROGRESS" | "TRIAL_PAID_SETUP_PENDING";
  learner: { name: string; goal: string; timelineDays: number | null; strengthSummary: string | null; interests: string[] };
  revenueCat: { appUserId: string; entitlementKey: string; offeringId: string };
  offer: { productKey: "TRY_IT_WITH_LABS"; localizedPrice: null; currencyCode: null; available: null; pricingSource: "REVENUECAT_SDK" } | null;
  trial: { status: "NOT_PURCHASED" | "PURCHASE_PENDING" | "ACTIVE_SETUP_PENDING" | "ACTIVE" | "COMPLETED"; activatedAt: string | null };
  learningState:"NEXT_UNIT_READY"|"DOUBT_CLEARANCE_REQUIRED"|"LAB_READY"|"LAB_IN_PROGRESS"|"CURRENT_RUNWAY_COMPLETE"|"NEXT_RUNWAY_AWAITING_PURCHASE"|"NEXT_RUNWAY_PURCHASED_GENERATING"|"NEXT_RUNWAY_READY"|null;
  primaryAction: { type: "START_TRIAL_PURCHASE" | "WAIT_FOR_PURCHASE" | "CONTINUE_TRIAL_SETUP"|"CONTINUE_LEARNING"|"DOUBT_CLEARANCE"|"START_LAB"|"RESUME_LAB"|"REVIEW_NEXT_RUNWAY"|"VIEW_NEXT_RUNWAY"|"WAIT_REFRESH" };
};

export type PurchaseIntent = { purchaseAttemptId: string | null; revenueCatAppUserId: string; productKey: "TRY_IT_WITH_LABS"; entitlementKey: string; status: "PENDING" | "ALREADY_ACTIVE" };
export type BillingState = {
  trialStatus: HomeState["trial"]["status"];
  purchase: { productKey: "TRY_IT_WITH_LABS"; productId: string; amount: number | null; currencyCode: string | null; store: string | null; status: "SUCCEEDED" | "REVOKED"; purchasedAt: string | null; transactionId: string } | null;
  message: "This is a one-time purchase, not a recurring subscription.";
};

export type LearningUnit = {
  unitId: string;
  sequence: number;
  title: string;
  goal: string;
  status: "LOCKED" | "READY" | "IN_PROGRESS" | "DOUBT_CHECKPOINT" | "COMPLETE";
  prerequisites: string[];
  productContext: string;
  groupingReason: string;
  labOutcomePlaceholder: string;
  concepts: { conceptId: string; name: string }[];
};
export type LessonContentBlock={blockId:string;position:number;type:"EXPLANATION"|"WHY_IT_MATTERS"|"TECHNICAL_DETAIL"|"EXAMPLE"|"STRUCTURED_VISUAL"|"CHECKPOINT"|"TEXT"|"BULLETS"|"CODE";title:string;body:string;items:string[];language?:string;code?:string};
export type ConceptLesson={lessonId:string;conceptId:string;conceptName:string;position:number;title:string;objective:string;recap:string[];completed:boolean;lastBlockPosition:number;blocks:LessonContentBlock[]};
export type UnitTeaching={unitId:string;introduction:string;generated:true;lessons:ConceptLesson[]};

export type ContinuationState = { runwayId:string; commercialProductKey:"TRY_IT"|"FOCUS"|"GROWTH"|"DEEP"; plannedUnits:number; plannedLabs:number; status:string; nextAction:"CONTINUE_LEARNING"|"DOUBT_CLEARANCE"|"START_LAB"|"RESUME_LAB"|"REVIEW_NEXT_RUNWAY"|"VIEW_NEXT_RUNWAY"|"WAIT_REFRESH"; nextUnitId:string|null; nextLabId:string|null; openDoubts:number; nextOffer:{commercialProductKey:"TRY_IT"|"FOCUS"|"GROWTH"|"DEEP";plannedUnits:number;plannedLabs:number;revenueCatOfferingId:string;revenueCatPackageId:string|null;revenueCatProductId:string|null;entitlementKey:string;available:boolean}|null; nextRoadmap:{sequence:number;title:string;summary:string;concepts:string[];labOutcome:string;status:"LOCKED"|"READY"|"IN_PROGRESS"|"DOUBT_CHECKPOINT"|"COMPLETE"}[] };
export type LearningNote = { noteId:string; sourceType:string; sourceId:string|null; unitId:string|null; conceptId:string|null; labId:string|null; selectedText:string|null; body:string; createdAt:string; updatedAt:string };
export type MarkedWord = { markedWordId:string; selectedText:string; simpleMeaning:string; technicalMeaning:string; sourceContext:string|null; learnerStatus:"I_KNOW_THIS"|"DONT_UNDERSTAND"|"GO_DEEPER"; unitId:string|null; conceptId:string|null; labId:string|null };
export type LearningDoubt={doubtId:string;sourceText:string;markerType:"DONT_UNDERSTAND"|"GO_DEEPER";status:string;resolutionType:"EXPLAIN_AT_CHECKPOINT"|"MERGE_INTO_NEXT_UNIT"|null;unitId:string|null;conceptName:string|null;unitTitle:string|null;context:{explanation?:string;recap?:string[]}|null};
export type LabCompletion={attemptId:string;attemptStatus:"IN_PROGRESS"|"SUBMITTED"|"COMPLETE";highestAssistanceLevel:string;hintsUsed:number;systemAssistanceUsed:boolean;run:{runId:string;status:"PASSED"|"FAILED"|"ERROR";result:Record<string,unknown>;createdAt:string}|null;submission:{submissionId:string;completed:boolean;evaluation:Record<string,unknown>;createdAt:string}|null;evidence:{evidenceId:string;conceptId:string|null;conceptName:string|null;assistanceLevel:string;outcome:"DEMONSTRATED"|"PARTIAL"|"NOT_DEMONSTRATED";details:Record<string,unknown>;createdAt:string}[]};
export type LabState = { labId:string; unitId:string; title:string; status:"LOCKED"|"READY"|"IN_PROGRESS"|"COMPLETE"; context:Record<string,unknown>; attemptId:string|null; hintsUsed:number|null; systemAssistanceUsed:boolean|null; nextAction:ContinuationState["nextAction"]; concepts:{conceptId:string;name:string}[]; hints:{fileId:string|null;hintNumber:1|2;hint:string;createdAt:string}[]; files:{fileId:string;path:string;role:"PROVIDED"|"READ_ONLY"|"YOU_BUILD"|"OPTIONAL_REFERENCE"|"TEST";content:string|null;draft:string|null;version:number|null;savedAt:string|null;humanMeaning:string|null;technicalRole:string|null;inputOutput:string|null;learningPurpose:string|null}[]; completion:LabCompletion|null };
export type LabWorkSummary={labId:string;unitId:string;unitTitle:string;title:string;status:"LOCKED"|"READY"|"IN_PROGRESS"|"COMPLETE";updatedAt:string;attempt:{attemptId:string;status:"IN_PROGRESS"|"SUBMITTED"|"COMPLETE";hintsUsed:number;systemAssistanceUsed:boolean;startedAt:string;completedAt:string|null}|null;submission:{submissionId:string;completed:boolean;evaluation:Record<string,unknown>;createdAt:string}|null;evidence:{demonstrated:number;partial:number;notDemonstrated:number}};

export type LearningConcept = {
  conceptId: string;
  name: string;
  shortExample: string;
  status: "KNOWN" | "RECOMMENDED" | "DEEP";
  relationship: "KNOWN_REPORTED" | "KNOWN_PROVEN" | "RECOMMENDED_NEXT" | "DEEPER_OPTIONAL" | "NOT_RELEVANT";
  recommendationReason: string;
  selected: boolean;
  depthCategory: "FOUNDATION" | "APPLIED" | "DEEP";
  requirementClass: "REQUIRED" | "USEFUL" | "OPTIONAL";
};

export type PaidSetupState = {
  learnerId: string;
  goalId: string;
  revision: number;
  status: "TRIAL_PAID_SETUP_PENDING" | "TRIAL_SCOPE_PROPOSED" | "TRIAL_SCOPE_CONFIRMED" | "TRIAL_GENERATING" | "TRIAL_READY" | "TRIAL_GENERATION_FAILED";
  context: {
    targetPath: "FRONTEND_ENGINEER" | "BACKEND_ENGINEER" | "FULL_STACK_ENGINEER" | "AI_APPLICATION_ENGINEER" | "CLOUD_DEVOPS_ENGINEER" | null;
    targetDepth:"BASIC"|"STANDARD"|"DEEP";
    role: string | null;
    goal: string;
    skills: { name: string; level: string | null; source: string }[];
    interests: string[];
    timelineDays: number | null;
    pace: string | null;
    jdText: string | null;
    targetCompany: string | null;
    productStyle: string | null;
  };
  requirements: { name: string; classification: "REQUIRED" | "USEFUL" | "OPTIONAL"; reason: string; source: "GOAL" | "PROFILE" | "JD" | "INTEREST" }[];
  learningMap: { capabilityId: string; name: string; tab: string; reason: string; scenario: string; concepts: LearningConcept[] }[];
  units: LearningUnit[];
  failureCode: string | null;
};
