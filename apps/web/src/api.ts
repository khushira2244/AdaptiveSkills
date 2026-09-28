import type { BillingState, ContinuationState, HomeState, LabState, LabSubmitResult, LabWorkSummary, LearningDoubt, LearningNote, LearningSourceType, LearningUnit, MarkedWord, MarkerType, OnboardingState, PaidSetupState, Session, Skill, UnitTeaching } from "@adaptive-labs/contracts";

const configuredUrl = import.meta.env.VITE_API_URL?.trim();
export const API_URL = (configuredUrl || (import.meta.env.DEV ? "http://127.0.0.1:3000" : "")).replace(/\/$/, "");
if (!API_URL) throw new Error("VITE_API_URL is required for production web builds.");

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, "OFFLINE", "Could not reach AdaptiveSkills. Check your connection and try again.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    if(response.status===401&&typeof window!=="undefined")window.dispatchEvent(new Event("adaptive:session-expired"));
    throw new ApiError(response.status, body?.error?.code ?? "REQUEST_FAILED", body?.error?.message ?? "Something went wrong.");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  signup: (email: string, password: string) => request<Session>("/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) => request<Session>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: (token: string) => request<void>("/auth/logout", { method: "POST", body: "{}" }, token),
  onboarding: (token: string) => request<OnboardingState>("/me/onboarding", {}, token),
  profile: (token: string, state: OnboardingState, profile: Partial<OnboardingState["profile"]>) => onboardingMutation(token, "/me/profile", "PATCH", { version: state.version, profile }),
  skills: (token: string, state: OnboardingState, skills: Skill[]) => onboardingMutation(token, "/me/skills", "PUT", { version: state.version, skills }),
  goal: (token: string, state: OnboardingState, target: string, reason: string | null) => onboardingMutation(token, "/me/goal", "PUT", { version: state.version, goal: { target, reason } }),
  interests: (token: string, state: OnboardingState, interests: string[]) => onboardingMutation(token, "/me/interests", "PUT", { version: state.version, interests }),
  preferences: (token: string, state: OnboardingState, timelineDays: number, pace: OnboardingState["preferences"]["pace"]) => onboardingMutation(token, "/me/preferences", "PUT", { version: state.version, preferences: { timelineDays, pace } }),
  resume: (token: string, state: OnboardingState, file: UploadDocument) => onboardingMutation(token, "/me/resume", "POST", { version: state.version, ...file }),
  confirmResume: (token: string, state: OnboardingState, resumeId: string, skillNames: string[]) => onboardingMutation(token, "/me/resume/confirm", "POST", { version: state.version, resumeId, skillNames }),
  advance: (token: string, state: OnboardingState) => onboardingMutation(token, "/me/onboarding/advance", "POST", { version: state.version, step: state.currentStep }),
  completeOnboarding: (token: string, state: OnboardingState) => onboardingMutation(token, "/me/onboarding/complete", "POST", { version: state.version }),
  home: (token: string) => request<HomeState>("/me/home", {}, token),
  billing: (token: string) => request<BillingState>("/me/billing", {}, token),
  reconcileInitialAccess: (token:string) => request<{reconciled:true;active:boolean}>("/me/commerce/reconcile",{method:"POST",body:"{}"},token),
  startPaidSetup: (token: string) => request<PaidSetupState>("/me/paid-setup/start", { method: "POST", body: "{}" }, token),
  paidSetup: (token: string) => request<PaidSetupState>("/me/paid-setup", {}, token),
  savePaidContext: (token: string, state: PaidSetupState, context: PaidContext) => request<PaidSetupState>("/me/paid-setup/context", { method: "PUT", body: JSON.stringify({ revision: state.revision, ...context }) }, token),
  readJdDocument: (token: string, file: UploadDocument) => request<{ filename: string; mimeType: string; text: string }>("/me/paid-setup/jd-document", { method: "POST", body: JSON.stringify(file) }, token),
  proposeLearningScope: (token: string, state: PaidSetupState) => request<PaidSetupState>("/me/learning-scope/propose", { method: "POST", body: JSON.stringify({ revision: state.revision }) }, token),
  saveLearningScope: (token: string, state: PaidSetupState, items: { conceptId: string; selected: boolean }[]) => request<PaidSetupState>("/me/learning-scope", { method: "PUT", body: JSON.stringify({ revision: state.revision, items }) }, token),
  confirmLearningScope: (token: string, state: PaidSetupState) => request<PaidSetupState>("/me/learning-scope/confirm", { method: "POST", body: JSON.stringify({ revision: state.revision }) }, token),
  generateLearningUnits: (token: string, state: PaidSetupState) => request<PaidSetupState>("/me/learning-units/generate", { method: "POST", body: JSON.stringify({ revision: state.revision }) }, token),
  learningUnits: (token: string) => request<LearningUnit[]>("/me/learning-units", {}, token),
  continuation: (token: string) => request<ContinuationState>("/me/learning-continuation", {}, token),
  analyzeContinuation: (token:string) => request<ContinuationState>("/me/learning-continuation/analyze",{method:"POST",body:"{}"},token),
  reconcileContinuationAccess: (token:string) => request<ContinuationState>("/me/learning-continuation/reconcile-purchase",{method:"POST",body:"{}"},token),
  labHistory: (token:string) => request<LabWorkSummary[]>("/me/labs",{},token),
  openUnitTeaching: (token: string, unitId: string) => request<UnitTeaching>(`/me/learning-units/${unitId}/teaching/open`, { method: "POST", body: "{}" }, token),
  unitTeaching: (token: string, unitId: string) => request<UnitTeaching>(`/me/learning-units/${unitId}/teaching`, {}, token),
  saveLessonProgress: (token: string, lessonId: string, lastBlockPosition: number, completed: boolean) => request<{ saved: true }>(`/me/concept-lessons/${lessonId}/progress`, { method: "PUT", body: JSON.stringify({ lastBlockPosition, completed }) }, token),
  completeLearningUnit: (token: string, unitId: string) => request<{ checkpoint: "LAB_READY"; labId: string }>(`/me/learning-units/${unitId}/complete`, { method: "POST", body: "{}" }, token),
  notes: (token: string, query = "") => request<LearningNote[]>(`/me/learning-notes${query ? `?q=${encodeURIComponent(query)}` : ""}`, {}, token),
  addNote: (token: string, input: LearningReference & { fileId: null; attachmentType: "SELECTED_TEXT"; attachmentRef: string; body: string }) => request<{ noteId: string }>("/me/learning-notes", { method: "POST", body: JSON.stringify(input) }, token),
  addMarker: (token: string, input: LearningReference & { markerType: MarkerType }) => request<{ markerId: string; doubtId: string | null }>("/me/learning-markers", { method: "POST", body: JSON.stringify(input) }, token),
  addMarkedWord: (token: string, input: LearningReference & { selectedText: string; sourceContext: string | null; learnerStatus: MarkerType }) => request<{ markedWordId: string }>("/me/marked-words", { method: "POST", body: JSON.stringify(input) }, token),
  markedWords: (token: string, query = "") => request<MarkedWord[]>(`/me/marked-words${query ? `?q=${encodeURIComponent(query)}` : ""}`, {}, token),
  learningDoubts: (token: string) => request<LearningDoubt[]>("/me/learning-doubts", {}, token),
  resolveDoubt: (token: string, doubtId: string) => request<{ resolved: true }>(`/me/learning-doubts/${doubtId}/resolve`, { method: "POST", body: "{}" }, token),
  lab: (token: string, labId: string) => request<LabState>(`/me/labs/${labId}`, {}, token),
  startLab: (token: string, labId: string) => request<{ attemptId: string }>(`/me/labs/${labId}/start`, { method: "POST", body: "{}" }, token),
  saveLabDraft: (token: string, input: { attemptId: string; fileId: string; content: string; version: number }) => request<{ version: number; savedAt: string }>("/me/labs/draft", { method: "PUT", body: JSON.stringify(input) }, token),
  runLab: (token: string, attemptId: string) => request<{ runId: string; status: "PASSED" | "FAILED" | "ERROR"; result: Record<string, unknown> }>("/me/labs/run", { method: "POST", body: JSON.stringify({ attemptId }) }, token),
  labHint: (token: string, attemptId: string, fileId: string) => request<{ fileId: string; hintNumber: number; hint: string; hintsRemaining: number }>("/me/labs/hints", { method: "POST", body: JSON.stringify({ attemptId, fileId }) }, token),
  systemAssistance: (token: string, attemptId: string) => request<{ assistanceLevel: "SYSTEM_ASSISTED"; content: string }>("/me/labs/system-assistance", { method: "POST", body: JSON.stringify({ attemptId }) }, token),
  submitLab: (token: string, attemptId: string) => request<LabSubmitResult>("/me/labs/submit", { method: "POST", body: JSON.stringify({ attemptId }) }, token),
};

type UploadDocument = { filename: string; mimeType: string; contentBase64: string };
type PaidContext = { jdText: string | null; targetCompany: string | null; productStyle: string | null; targetDepth: "BASIC" | "STANDARD" | "DEEP" };
export type LearningReference = { sourceType: LearningSourceType; sourceId: string; unitId: string; conceptId: string; labId: null; selectedText: string };

function onboardingMutation(token: string, path: string, method: string, body: unknown) {
  return request<OnboardingState>(path, { method, body: JSON.stringify(body) }, token);
}
