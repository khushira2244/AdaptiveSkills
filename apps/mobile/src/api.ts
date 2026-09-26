import { Platform } from "react-native";
import type { BillingState, ContinuationState, HomeState, LabState, LearningDoubt, LearningNote, LearningUnit, MarkedWord, OnboardingState, PaidSetupState, PurchaseIntent, Session, Skill, UnitTeaching } from "./types";

const developmentUrl = Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://127.0.0.1:3000";
const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
export const API_URL = (configuredUrl || (__DEV__ ? developmentUrl : "")).replace(/\/$/, "");
if (!API_URL) throw new Error("EXPO_PUBLIC_API_URL is required in production builds.");

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
    throw new ApiError(0, "OFFLINE", "Could not reach AdaptiveSkills. Check that the API is running and try again.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(response.status, body?.error?.code || "REQUEST_FAILED", body?.error?.message || "Something went wrong.");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  signup: (email: string, password: string) => request<Session>("/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) => request<Session>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: (token: string) => request<void>("/auth/logout", { method: "POST", body: "{}" }, token),
  onboarding: (token: string) => request<OnboardingState>("/me/onboarding", {}, token),
  profile: (token: string, state: OnboardingState, profile: Partial<OnboardingState["profile"]>) => mutate(token, "/me/profile", "PATCH", { version: state.version, profile }),
  skills: (token: string, state: OnboardingState, skills: Skill[]) => mutate(token, "/me/skills", "PUT", { version: state.version, skills }),
  goal: (token: string, state: OnboardingState, target: string, reason: string | null) => mutate(token, "/me/goal", "PUT", { version: state.version, goal: { target, reason } }),
  interests: (token: string, state: OnboardingState, interests: string[]) => mutate(token, "/me/interests", "PUT", { version: state.version, interests }),
  preferences: (token: string, state: OnboardingState, timelineDays: number, pace: OnboardingState["preferences"]["pace"]) => mutate(token, "/me/preferences", "PUT", { version: state.version, preferences: { timelineDays, pace } }),
  resume: (token: string, state: OnboardingState, file: { filename: string; mimeType: string; contentBase64: string }) => mutate(token, "/me/resume", "POST", { version: state.version, ...file }),
  confirmResume: (token: string, state: OnboardingState, resumeId: string, skillNames: string[]) => mutate(token, "/me/resume/confirm", "POST", { version: state.version, resumeId, skillNames }),
  advance: (token: string, state: OnboardingState) => mutate(token, "/me/onboarding/advance", "POST", { version: state.version, step: state.currentStep }),
  complete: (token: string, state: OnboardingState) => mutate(token, "/me/onboarding/complete", "POST", { version: state.version }),
  home: (token: string) => request<HomeState>("/me/home", {}, token),
  billing: (token: string) => request<BillingState>("/me/billing", {}, token),
  learningUnits: (token: string) => request<LearningUnit[]>("/me/learning-units", {}, token),
  startPaidSetup: (token: string) => request<PaidSetupState>("/me/paid-setup/start", { method: "POST", body: "{}" }, token),
  paidSetup: (token: string) => request<PaidSetupState>("/me/paid-setup", {}, token),
  savePaidContext: (token: string, state: PaidSetupState, context: { jdText: string | null; targetCompany: string | null; productStyle: string | null;targetDepth:"BASIC"|"STANDARD"|"DEEP" }) => request<PaidSetupState>("/me/paid-setup/context", { method: "PUT", body: JSON.stringify({ revision: state.revision, ...context }) }, token),
  readJdDocument: (token:string,file:{filename:string;mimeType:string;contentBase64:string}) => request<{filename:string;mimeType:string;text:string}>("/me/paid-setup/jd-document",{method:"POST",body:JSON.stringify(file)},token),
  proposeLearningScope: (token: string, state: PaidSetupState) => request<PaidSetupState>("/me/learning-scope/propose", { method: "POST", body: JSON.stringify({ revision: state.revision }) }, token),
  saveLearningScope: (token: string, state: PaidSetupState, items: { conceptId: string; selected: boolean }[]) => request<PaidSetupState>("/me/learning-scope", { method: "PUT", body: JSON.stringify({ revision: state.revision, items }) }, token),
  confirmLearningScope: (token: string, state: PaidSetupState) => request<PaidSetupState>("/me/learning-scope/confirm", { method: "POST", body: JSON.stringify({ revision: state.revision }) }, token),
  generateLearningUnits: (token: string, state: PaidSetupState) => request<PaidSetupState>("/me/learning-units/generate", { method: "POST", body: JSON.stringify({ revision: state.revision }) }, token),
  continuation: (token:string) => request<ContinuationState>("/me/learning-continuation",{},token),
  analyzeContinuation:(token:string)=>request<ContinuationState>("/me/learning-continuation/analyze",{method:"POST",body:"{}"},token),
  continuationPurchaseIntent:(token:string,countryCode?:string)=>request<{purchaseAttemptId:string|null;revenueCatAppUserId:string;entitlementKey:string;status:"PENDING"|"ALREADY_ACTIVE"}>("/me/learning-continuation/purchase-intent",{method:"POST",body:JSON.stringify({platform:Platform.OS==="ios"?"ios":"android",countryCode:countryCode||null})},token),
  continuationPurchaseOutcome:(token:string,purchaseAttemptId:string,outcome:"CANCELLED"|"FAILED",errorCode?:string)=>request<{status:string}>("/me/learning-continuation/purchase-outcome",{method:"POST",body:JSON.stringify({purchaseAttemptId,outcome,errorCode:errorCode||null})},token),
  reconcileContinuationPurchase:(token:string)=>request<ContinuationState>("/me/learning-continuation/reconcile-purchase",{method:"POST",body:"{}"},token),
  notes: (token:string,q="") => request<LearningNote[]>(`/me/learning-notes?q=${encodeURIComponent(q)}`,{},token),
  addNote: (token:string,body:unknown) => request<{noteId:string}>("/me/learning-notes",{method:"POST",body:JSON.stringify(body)},token),
  markedWords: (token:string,q="") => request<MarkedWord[]>(`/me/marked-words?q=${encodeURIComponent(q)}`,{},token),
  addMarkedWord: (token:string,body:unknown) => request<{markedWordId:string}>("/me/marked-words",{method:"POST",body:JSON.stringify(body)},token),
  addMarker: (token:string,body:unknown) => request<{markerId:string;doubtId:string|null}>("/me/learning-markers",{method:"POST",body:JSON.stringify(body)},token),
  learningDoubts:(token:string)=>request<LearningDoubt[]>("/me/learning-doubts",{},token),
  resolveDoubt:(token:string,doubtId:string)=>request<{resolved:true}>(`/me/learning-doubts/${doubtId}/resolve`,{method:"POST",body:"{}"},token),
  completeLearningUnit: (token:string,unitId:string) => request<{checkpoint:string;labId:string}>(`/me/learning-units/${unitId}/complete`,{method:"POST",body:"{}"},token),
  openUnitTeaching:(token:string,unitId:string)=>request<UnitTeaching>(`/me/learning-units/${unitId}/teaching/open`,{method:"POST",body:"{}"},token),
  saveLessonProgress:(token:string,lessonId:string,lastBlockPosition:number,completed:boolean)=>request<{saved:true}>(`/me/concept-lessons/${lessonId}/progress`,{method:"PUT",body:JSON.stringify({lastBlockPosition,completed})},token),
  startLab: (token:string,labId:string) => request<{attemptId:string}>(`/me/labs/${labId}/start`,{method:"POST",body:"{}"},token),
  lab: (token:string,labId:string) => request<LabState>(`/me/labs/${labId}`,{},token),
  saveLabDraft: (token:string,body:{attemptId:string;fileId:string;content:string;version:number}) => request<{version:number;savedAt:string}>("/me/labs/draft",{method:"PUT",body:JSON.stringify(body)},token),
  labHint: (token:string,attemptId:string,fileId:string) => request<{fileId:string;hintNumber:number;hint:string;hintsRemaining:number}>("/me/labs/hints",{method:"POST",body:JSON.stringify({attemptId,fileId})},token),
  systemAssistance: (token:string,attemptId:string) => request<{assistanceLevel:"SYSTEM_ASSISTED";content:string}>("/me/labs/system-assistance",{method:"POST",body:JSON.stringify({attemptId})},token),
  runLab: (token:string,attemptId:string) => request<{status:string;result:unknown}>("/me/labs/run",{method:"POST",body:JSON.stringify({attemptId})},token),
  submitLab: (token:string,attemptId:string) => request<{passed:boolean;nextAction:string}>("/me/labs/submit",{method:"POST",body:JSON.stringify({attemptId})},token),
  purchaseIntent: (token: string, countryCode?: string) => request<PurchaseIntent>("/me/purchases/intent", { method: "POST", body: JSON.stringify({ platform: Platform.OS === "ios" ? "ios" : "android", countryCode: countryCode || null }) }, token),
  purchaseOutcome: (token: string, purchaseAttemptId: string, outcome: "CANCELLED" | "FAILED", errorCode?: string) => request<{ status: string }>("/me/purchases/outcome", { method: "POST", body: JSON.stringify({ purchaseAttemptId, outcome, errorCode: errorCode || null }) }, token),
  reconcile: (token: string) => request<{ reconciled: true; active: boolean }>("/me/commerce/reconcile", { method: "POST", body: "{}" }, token),
};

function mutate(token: string, path: string, method: string, body: unknown) {
  return request<OnboardingState>(path, { method, body: JSON.stringify(body) }, token);
}
