import { appBackAction,unitStatusLabel } from "./learning-navigation";
import { Pressable } from "./PointerPressable";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Alert, ActivityIndicator, BackHandler, Image, Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { getLocales } from "expo-localization";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { api, ApiError, API_URL } from "./api";
import { sessionStore } from "./session";
import { loadRevenueCatOffer, purchaseRevenueCatPackage, restoreRevenueCatPurchases, revenueCatFailure, type StoreOffer } from "./revenuecat";
import type { BillingState, ContinuationState, HomeState, LearningNote, LearningUnit, OnboardingState, Pace, Skill, Step } from "./types";
import { Brand, C, Chip, Choice, Field, Footer, Heading, Notice, PrimaryButton, Progress, Screen, styles as ui } from "./ui";
import { LayerThree } from "./LayerThree";
import { LayerFour } from "./LayerFour";

type Route = "splash" | "welcome" | "auth" | "onboarding" | "payment" | "home" | "paidHome" | "continuation" | "layer3" | "learning" | "notes" | "billing";
type ViewStep = "profile" | "resume" | "skills" | "goal" | "interests" | "preferences" | "review";
const viewSteps: ViewStep[] = ["profile", "resume", "skills", "goal", "interests", "preferences", "review"];

function stepView(step: Step): ViewStep {
  switch (step) {
    case "profile": case "role": case "experience": return "profile";
    case "complete": return "review";
    default: return step;
  }
}

export default function App() {
  return <SafeAreaProvider><StatusBar style="dark"/><AppContent/></SafeAreaProvider>;
}

function AppContent() {
  const [route, setRoute] = useState<Route>("splash");
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<OnboardingState | null>(null);
  const [homeState, setHomeState] = useState<HomeState | null>(null);
  const [learningLabId,setLearningLabId]=useState<string|null>(null);
  const [learningUnit,setLearningUnit]=useState<LearningUnit|null>(null);
  const [learningPage,setLearningPage]=useState<"learn"|"work">("learn");
  const [storeOffer, setStoreOffer] = useState<StoreOffer | null>(null);
  const [offerError, setOfferError] = useState("");
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [bootError, setBootError] = useState("");

  async function restore() {
    setBootError("");
    const minimumSplash = new Promise(resolve => setTimeout(resolve, 1200));
    const saved = await sessionStore.get();
    if (!saved) {
      await minimumSplash;
      setRoute("welcome");
      return;
    }
    try {
      const current = await api.onboarding(saved);
      await minimumSplash;
      setToken(saved);
      setState(current);
      if (current.completed) await openHome(saved); else setRoute("onboarding");
    } catch (error) {
      await minimumSplash;
      if (error instanceof ApiError && error.status === 401) {
        await sessionStore.clear();
        setRoute("auth");
      } else {
        setBootError(error instanceof Error ? error.message : "Could not restore your session.");
      }
    }
  }

  useEffect(() => { void restore(); }, []);
  useEffect(()=>{const subscription=BackHandler.addEventListener("hardwareBackPress",()=>{
    const action=appBackAction(route);
    if(action==="EXIT"){BackHandler.exitApp();return true;}
    if(action==="PAID_HOME"){setRoute(homeState?.state==="TRIAL_PAID_SETUP_PENDING"?"paidHome":"home");return true;}
    if(action==="HOME"){setRoute("home");return true;}
    return false;
  });return()=>subscription.remove();},[route,homeState?.state]);

  async function openHome(sessionToken: string) {
    const home = await api.home(sessionToken);
    setHomeState(home);
    setRoute(home.state === "TRIAL_PAID_SETUP_PENDING" ? "paidHome" : "home");
  }

  useEffect(() => {
    if (!homeState || homeState.state === "TRIAL_PAID_SETUP_PENDING") return;
    let active = true;
    const countryCode = getLocales()[0]?.regionCode?.toUpperCase() ?? null;
    setStoreOffer(null); setOfferError("");
    loadRevenueCatOffer(homeState.revenueCat.appUserId, homeState.revenueCat.offeringId, countryCode)
      .then(offer => { if (active) setStoreOffer(offer); })
      .catch(error => { if (active) setOfferError(message(error)); });
    return () => { active = false; };
  }, [homeState?.revenueCat.appUserId, homeState?.revenueCat.offeringId, homeState?.state]);

  async function authenticated(sessionToken: string) {
    await sessionStore.set(sessionToken);
    const current = await api.onboarding(sessionToken);
    setToken(sessionToken);
    setState(current);
    if (current.completed) await openHome(sessionToken); else setRoute("onboarding");
  }

  async function logout() {
    if (token) await api.logout(token).catch(() => undefined);
    await sessionStore.clear();
    setToken(null);
    setState(null);
    setHomeState(null); setStoreOffer(null);
    setRoute("welcome");
  }

  async function purchase() {
    if (!token || !storeOffer) return;
    setPurchaseBusy(true); setOfferError("");
    let attemptId: string | null = null; let sdkSucceeded = false;
    try {
      const intent = await api.purchaseIntent(token, storeOffer.countryCode ?? undefined);
      attemptId = intent.purchaseAttemptId;
      if (intent.status === "ALREADY_ACTIVE") return void await openHome(token);
      const result = await purchaseRevenueCatPackage(storeOffer.package);
      if (!result.customerInfo.entitlements.active[intent.entitlementKey]) throw new Error("RevenueCat completed the purchase but the configured entitlement is not active.");
      sdkSucceeded = true;
      const reconciliation = await api.reconcile(token);
      if (!reconciliation.active) throw new Error("The purchase entitlement could not be confirmed by the backend. Try Restore Purchase.");
      const refreshed = await api.home(token);
      setHomeState(refreshed);
      if (refreshed.state !== "TRIAL_PAID_SETUP_PENDING") throw new Error("Purchase succeeded, but the backend entitlement has not updated yet. Try Restore Purchase.");
      setRoute("paidHome");
    } catch (error) {
      const failure = revenueCatFailure(error);
      if (attemptId && !sdkSucceeded) await api.purchaseOutcome(token, attemptId, failure.cancelled ? "CANCELLED" : "FAILED", failure.code).catch(() => undefined);
      if (failure.cancelled) {
        await openHome(token).catch(() => setRoute("home"));
        setOfferError("Purchase cancelled. You can unlock the plan whenever you’re ready.");
      } else {
        if (!sdkSucceeded) api.home(token).then(setHomeState).catch(() => undefined);
        setOfferError(failure.message);
      }
    } finally { setPurchaseBusy(false); }
  }

  async function restorePurchase() {
    if (!token || !homeState) return;
    setPurchaseBusy(true); setOfferError("");
    try {
      const customer = await restoreRevenueCatPurchases();
      if (!customer.entitlements.active[homeState.revenueCat.entitlementKey]) throw new Error("No active Try It purchase was found for this account.");
      await api.reconcile(token); await openHome(token);
    } catch (error) { setOfferError(message(error)); }
    finally { setPurchaseBusy(false); }
  }

  if (route === "splash") return <Splash error={bootError} retry={() => void restore()} />;
  if (route === "welcome") return <Welcome onStart={() => setRoute("auth")} />;
  if (route === "auth") return <Auth onAuthenticated={authenticated} onBack={() => setRoute("welcome")} />;
  if (route === "payment" && state && homeState) return <PaymentOffer state={state} price={storeOffer?.priceString} error={offerError} busy={purchaseBusy} onPurchase={() => void purchase()} onBack={() => setRoute("home")} />;
  if (route === "home" && state && homeState) return <Home state={state} pending={homeState.state === "PURCHASE_IN_PROGRESS"} price={storeOffer?.priceString} error={offerError} busy={purchaseBusy} onUnlock={() => setRoute("payment")} onRestore={() => void restorePurchase()} onBilling={() => setRoute("billing")} onLogout={() => void logout()} />;
  if (route === "paidHome" && state && token && homeState) return <PaidHome token={token} state={state} home={homeState} onContinue={() => {void (async()=>{if(homeState.primaryAction.type==="CONTINUE_TRIAL_SETUP")return setRoute("layer3");const continuation=await api.continuation(token);if(continuation.nextAction==="REVIEW_NEXT_RUNWAY")await api.analyzeContinuation(token);if(continuation.nextAction==="REVIEW_NEXT_RUNWAY"||continuation.nextAction==="VIEW_NEXT_RUNWAY")return setRoute("continuation");setLearningPage("learn");setLearningUnit(null);setRoute("learning");})().catch(error=>setBootError(message(error)));}} onOpenLab={labId=>{setLearningPage("learn");setLearningUnit(null);setLearningLabId(labId);setRoute("learning");}} onOpenUnit={unit=>{setLearningPage("learn");setLearningLabId(null);setLearningUnit(unit);setRoute("learning");}} onNotes={()=>setRoute("notes")} onBilling={() => setRoute("billing")} onLogout={() => void logout()} />;
  if(route==="continuation"&&token&&homeState)return <ContinuationOffer token={token} appUserId={homeState.revenueCat.appUserId} onBack={()=>setRoute("paidHome")} onSuccess={()=>openHome(token)}/>;
  if (route === "layer3" && token) return <LayerThree token={token} onHome={() => setRoute("paidHome")} onLearn={() => setRoute("learning")} />;
  if (route === "learning" && token) return <LayerFour token={token} initialPage={learningPage} initialUnit={learningUnit} initialLabId={learningLabId} onHome={() => {setLearningLabId(null);setLearningUnit(null);void openHome(token).catch(error=>setBootError(message(error)));}} />;
  if (route === "notes" && token) return <SavedNotesPage token={token} onBack={() => void openHome(token)} onOpenUnit={unit=>{setLearningPage("learn");setLearningLabId(null);setLearningUnit(unit);setRoute("learning");}} onOpenLab={labId=>{setLearningPage("learn");setLearningUnit(null);setLearningLabId(labId);setRoute("learning");}} />;
  if (route === "billing" && token) return <Billing token={token} onBack={() => void openHome(token)} />;
  if (route === "onboarding" && token && state) return <Onboarding token={token} initial={state} onBack={() => setRoute("welcome")} onState={setState} onComplete={next => { setState(next); api.home(token).then(home => { setHomeState(home); setRoute("payment"); }).catch(error => setBootError(message(error))); }} />;
  return <Splash error="Your session could not be loaded." retry={() => void restore()} />;
}

function Splash({ error, retry }: { error: string; retry: () => void }) {
  return <View style={local.splash}><Image source={require("../assets/adaptive-skills-logo.png")} resizeMode="contain" style={local.splashLogo} />{error ? <View style={local.splashError}><Notice tone="red">{error}</Notice><PrimaryButton label="Try again" onPress={retry} /></View> : null}</View>;
}

function Welcome({ onStart }: { onStart: () => void }) {
  return <Screen footer={<View style={local.welcomeFooter}><Text style={local.promise}>Different goals. One adaptive path.</Text><PrimaryButton label="Let's get started" onPress={onStart} /></View>}>
    <Brand />
    <View style={{ marginTop: 28 }}><Heading title={<>Welcome to{"\n"}AdaptiveSkills</>} subtitle="Personalized learning to help you build the skills for what's next." /></View>
    <LinearGradient colors={["#EAF7FF", "#F5FBFF"]} style={local.hero}>
      <View style={local.sun} /><Text style={local.person}>🎒</Text><View style={local.signs}><Text style={local.sign}>Learn</Text><Text style={[local.sign, { marginLeft: 14 }]}>Build</Text><Text style={[local.sign, { marginLeft: 6 }]}>Grow</Text></View><View style={local.hills}><Text style={{ fontSize: 76 }}>🏔️</Text></View>
    </LinearGradient>
  </Screen>;
}

function Auth({ onAuthenticated, onBack }: { onAuthenticated: (token: string) => Promise<void>; onBack: () => void }) {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (!email.includes("@")) return setError("Enter a valid email address.");
    if (password.length < 12) return setError("Password must contain at least 12 characters.");
    setBusy(true); setError("");
    try { const session = mode === "signup" ? await api.signup(email, password) : await api.login(email, password); await onAuthenticated(session.token); }
    catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  return <Screen>
    <Pressable onPress={onBack} style={ui.backTop}><Text style={ui.backTopText}>‹</Text></Pressable><Brand />
    <View style={{ marginTop: 22 }}><Heading title={mode === "signup" ? "Create your account" : "Welcome back"} subtitle="Your progress stays synced across every session." /></View>
    <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" />
    <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 12 characters" />
    {error ? <Notice tone="red">{error}</Notice> : null}<PrimaryButton label={mode === "signup" ? "Create account" : "Sign in"} onPress={() => void submit()} busy={busy} />
    <Pressable onPress={() => { setMode(mode === "signup" ? "login" : "signup"); setError(""); }}><Text style={local.authSwitch}>{mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}</Text></Pressable>
    <Text style={local.endpoint}>Local API: {API_URL}</Text>
  </Screen>;
}

function Onboarding({ token, initial, onBack, onState, onComplete }: { token: string; initial: OnboardingState; onBack: () => void; onState: (s: OnboardingState) => void; onComplete: (s: OnboardingState) => void }) {
  const [state, setState] = useState(initial);
  const [view, setView] = useState<ViewStep>(stepView(initial.currentStep));
  const update = (next: OnboardingState, navigate = true) => { setState(next); onState(next); if (navigate) setView(stepView(next.currentStep)); };
  const index = viewSteps.indexOf(view);
  const back = index > 0 ? () => setView(viewSteps[index - 1]!) : onBack;
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { back(); return true; });
    return () => subscription.remove();
  }, [back]);
  const common = { token, state, update, canonical: stepView(state.currentStep) === view };
  if (view === "profile") return <ProfileScreen {...common} back={back} />;
  if (view === "resume") return <ResumeScreen {...common} back={back} />;
  if (view === "skills") return <SkillsScreen {...common} back={back} />;
  if (view === "goal") return <GoalScreen {...common} back={back} />;
  if (view === "interests") return <InterestsScreen {...common} back={back} />;
  if (view === "preferences") return <PreferencesScreen {...common} back={back} />;
  return <ReviewScreen token={token} state={state} update={update} back={back} edit={setView} onComplete={onComplete} />;
}

type Common = { token: string; state: OnboardingState; update: (s: OnboardingState, navigate?: boolean) => void; canonical: boolean; back?: () => void };
function Frame({ step, back, children, footer }: { step: number; back?: () => void; children: ReactNode; footer: ReactNode }) {
  return <Screen footer={footer}><Progress step={step} onBack={back} />{children}</Screen>;
}

function ProfileScreen({ token, state, update, canonical, back }: Common) {
  const [name, setName] = useState(state.profile.displayName || "");
  const [role, setRole] = useState(state.profile.currentRole || "");
  const [persona, setPersona] = useState("");
  const [experience, setExperience] = useState(state.profile.experienceYears?.toString() || "");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const personas = [["Student", "I'm studying (school / college / university)", "🎓"], ["Working professional", "I have a job", "💼"], ["Freelancer / Self-employed", "I work independently", "👤"], ["Career switcher", "I'm transitioning to a new field", "↻"], ["Other", "Prefer not to say", "▣"]];
  async function save() {
    const years = Number(experience);
    if (!name.trim()) return setError("Tell us what we should call you.");
    if (!role.trim()) return setError("Enter your current role.");
    if (experience === "" || Number.isNaN(years) || years < 0 || years > 80) return setError("Enter your years of experience between 0 and 80.");
    setBusy(true); setError("");
    try {
      let next = await api.profile(token, state, { displayName: name.trim(), currentRole: role.trim(), experienceYears: years });
      if (canonical) while (["profile", "role", "experience"].includes(next.currentStep)) next = await api.advance(token, next);
      update(next);
    } catch (e) { await recover(e, token, update, setError); } finally { setBusy(false); }
  }
  return <Frame step={1} back={back} footer={<Footer primary={canonical ? "Continue" : "Save changes"} onPrimary={() => void save()} busy={busy} />}>
    <Heading title="Who are you right now?" subtitle="This helps us understand your current context and tailor your experience." />
    <Field label="Your name" value={name} onChangeText={setName} placeholder="Enter your name" />
    {personas.map(([p, detail, icon]) => <Choice key={p} title={p!} detail={detail} icon={icon} selected={persona === p} onPress={() => setPersona(p!)} />)}
    <View style={{ marginTop: 10 }}><Field label="Current role" value={role} onChangeText={setRole} placeholder="e.g. Frontend Developer" /></View>
    <Field label="Years of experience" value={experience} onChangeText={setExperience} keyboardType="decimal-pad" placeholder="e.g. 2" />
    {error ? <Notice tone="red">{error}</Notice> : null}
  </Frame>;
}

function ResumeScreen({ token, state, update, canonical, back }: Common) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>(state.resume?.confirmed ? [] : state.resume?.suggestions || []);
  async function pick() {
    setError("");
    const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"], copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0]; if (!asset) return;
    if ((asset.size || 0) > 2 * 1024 * 1024) return setError("Choose a file smaller than 2 MB.");
    const mimeType = resumeMimeType(asset.name, asset.mimeType);
    if (!mimeType) return setError("Choose a PDF, DOCX or TXT file.");
    const uriScheme = asset.uri.split(":", 1)[0] || "unknown";
    console.info("[resume] file selected", { filename: asset.name, mimeType, size: asset.size ?? null, uriScheme });
    setBusy(true);
    let cachedFile: File | null = null;
    try {
      let readableFile = new File(asset.uri);
      if (uriScheme === "content") {
        cachedFile = new File(Paths.cache, `resume-${Date.now()}${resumeExtension(asset.name, mimeType)}`);
        await readableFile.copy(cachedFile, { overwrite: true });
        readableFile = cachedFile;
      }
      const contentBase64 = await readableFile.base64();
      console.info("[resume] file bytes read", { filename: asset.name, mimeType, size: asset.size ?? null, uriScheme, bytesRead: contentBase64.length > 0 });
      const next = await api.resume(token, state, { filename: asset.name, mimeType, contentBase64 });
      console.info("[resume] extraction completed", { filename: asset.name, suggestionCount: next.resume?.suggestions.length ?? 0 });
      setSelected(next.resume?.suggestions || []); update(next, false);
    } catch (e) {
      console.error("[resume] upload or extraction failed", { filename: asset.name, mimeType, size: asset.size ?? null, uriScheme, error: message(e) });
      await recover(e, token, update, setError);
    } finally {
      if (cachedFile?.exists) cachedFile.delete();
      setBusy(false);
    }
  }
  async function continueNext() {
    setBusy(true); setError("");
    try {
      let next = state;
      if (next.resume && !next.resume.confirmed && selected.length) next = await api.confirmResume(token, next, next.resume.resumeId, selected);
      if (canonical) next = await api.advance(token, next);
      update(next);
    } catch (e) { await recover(e, token, update, setError); } finally { setBusy(false); }
  }
  return <Frame step={2} back={back} footer={<Footer secondary={canonical && !state.resume ? "Skip for now" : undefined} onSecondary={() => void continueNext()} primary={state.resume ? "Continue" : "Choose a file"} onPrimary={() => state.resume ? void continueNext() : void pick()} busy={busy} />}>
    <Heading title="Would you like to add your CV / Resume?" subtitle="This is optional, but it helps us suggest relevant skills. You decide what becomes part of your profile." />
    <Pressable onPress={() => void pick()} style={local.upload}><Text style={{ fontSize: 42 }}>📄</Text><Text style={local.uploadTitle}>{state.resume?.filename || "Choose your resume"}</Text><Text style={local.uploadHint}>PDF, DOCX or TXT · Max 2 MB</Text></Pressable>
    <Notice>🔒 Your data is private. Extracted skills remain suggestions until you confirm them.</Notice>
    {state.resume?.suggestions.length ? <View style={{ marginTop: 14 }}><Text style={ui.label}>Skills found — select the ones to add</Text><View style={local.wrap}>{state.resume.suggestions.map(item => <Chip key={item} label={item} selected={selected.includes(item)} onPress={() => setSelected(toggle(selected, item))} />)}</View></View> : null}
    {error ? <Notice tone="red">{error}</Notice> : null}
  </Frame>;
}

const resumeMimeTypes = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
} as const;

function resumeMimeType(filename: string, reported?: string | null) {
  const lowerName = filename.toLowerCase();
  const extension = (Object.keys(resumeMimeTypes) as (keyof typeof resumeMimeTypes)[]).find(item => lowerName.endsWith(item));
  if (extension) return resumeMimeTypes[extension];
  return (Object.values(resumeMimeTypes) as string[]).includes(reported || "") ? reported! : null;
}

function resumeExtension(filename: string, mimeType: string) {
  const lowerName = filename.toLowerCase();
  const extension = (Object.keys(resumeMimeTypes) as (keyof typeof resumeMimeTypes)[]).find(item => lowerName.endsWith(item));
  if (extension) return extension;
  return mimeType === "application/pdf" ? ".pdf" : mimeType === "text/plain" ? ".txt" : ".docx";
}

function SkillsScreen({ token, state, update, canonical, back }: Common) {
  const [skills, setSkills] = useState<Skill[]>(state.skills);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function persist(nextSkills: Skill[]) {
    setSkills(nextSkills); setBusy(true); setError("");
    try { const next = await api.skills(token, state, nextSkills); setSkills(next.skills); update(next, false); }
    catch (e) { setSkills(state.skills); await recover(e, token, update, setError); }
    finally { setBusy(false); }
  }
  function add() {
    const clean = name.trim();
    if (!clean) return;
    if (skills.some(s => s.name.toLowerCase() === clean.toLowerCase())) return setError("That skill is already listed.");
    setName("");
    void persist([...skills, { name: clean, source: "MANUAL", level: null, subskills: [] }]);
  }
  function remove(index: number) { void persist(skills.filter((_, itemIndex) => itemIndex !== index)); }
  async function save() {
    setBusy(true); setError(""); try { let next = await api.skills(token, state, skills); if (canonical) next = await api.advance(token, next); update(next); } catch (e) { await recover(e, token, update, setError); } finally { setBusy(false); }
  }
  return <Frame step={3} back={back} footer={<Footer primary={canonical ? "Continue" : "Save changes"} onPrimary={() => void save()} busy={busy} />}>
    <Heading title="Review your skills" subtitle={state.resume ? "We found these skills from your resume. Remove anything that does not belong and add anything we missed." : "Add the skills you already have. You can remove anything that does not belong and add anything we missed."} />
    <View style={local.skillTray}><Text style={local.levelTitle}>Your skills</Text><View style={local.skillReviewList}>{skills.map((skill, index) => <View style={local.skillReviewChip} key={`${skill.name}-${index}`}><Text style={local.skillChipText}>{skill.name}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Remove ${skill.name}`} onPress={() => remove(index)} hitSlop={8} style={local.skillRemove}><Text style={local.skillRemoveText}>×</Text></Pressable></View>)}</View>{!skills.length ? <Text style={local.empty}>No skills added yet. Add any skills you want AdaptiveSkills to know about.</Text> : null}</View>
    <Field label="Add a skill" value={name} onChangeText={setName} placeholder="e.g. TypeScript, CAD, Product research" returnKeyType="done" onSubmitEditing={add} />
    <Pressable onPress={add} style={local.add}><Text style={local.addText}>＋ Add skill</Text></Pressable>
    {error ? <Notice tone="red">{error}</Notice> : null}
  </Frame>;
}

function GoalScreen({ token, state, update, canonical, back }: Common) {
  const [target, setTarget] = useState(state.goal?.target || ""); const [reason, setReason] = useState(state.goal?.reason || ""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function save() { if (!target.trim()) return setError("Describe what you want to achieve."); setBusy(true); setError(""); try { let next = await api.goal(token, state, target.trim(), reason.trim() || null); if (canonical) next = await api.advance(token, next); update(next); } catch (e) { await recover(e, token, update, setError); } finally { setBusy(false); } }
  return <Frame step={4} back={back} footer={<Footer primary={canonical ? "Continue" : "Save changes"} onPrimary={() => void save()} busy={busy} />}>
    <Heading title="What do you want to achieve?" subtitle="Tell us in your own words. Be as open as you like." />
    <Field label="Your goal" value={target} onChangeText={setTarget} multiline maxLength={3000} placeholder="For example: I want to become an AI application engineer who can work on real-world products." />
    <Text style={local.counter}>{target.length}/3000</Text><Field label="Why does this matter to you? (optional)" value={reason} onChangeText={setReason} multiline placeholder="Your motivation helps personalize the path." />
    <Notice>💡 You can write anything. We’ll help turn it into a practical learning path.</Notice>{error ? <Notice tone="red">{error}</Notice> : null}
  </Frame>;
}

const interestOptions = [["Healthcare", "♥"], ["Space & Aerospace", "🚀"], ["Finance / Fintech", "🏦"], ["Education", "▮"], ["Developer Tools", "‹/›"], ["Enterprise Software", "▦"], ["E-commerce", "🛒"], ["Cybersecurity", "◆"], ["Automotive", "🚙"], ["Robotics", "🤖"], ["Media & Content", "▶"], ["Climate & Energy", "🌱"], ["Government / Civic Tech", "🏛"], ["Consumer Apps", "▯"]];
function InterestsScreen({ token, state, update, canonical, back }: Common) {
  const [items, setItems] = useState(state.interests); const [custom, setCustom] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  function addCustom() { const clean = custom.trim(); if (clean && !items.some(x => x.toLowerCase() === clean.toLowerCase())) setItems([...items, clean]); setCustom(""); }
  async function save() { setBusy(true); setError(""); try { let next = await api.interests(token, state, items); if (canonical) next = await api.advance(token, next); update(next); } catch (e) { await recover(e, token, update, setError); } finally { setBusy(false); } }
  return <Frame step={5} back={back} footer={<Footer secondary={items.length ? undefined : "Skip for now"} onSecondary={() => void save()} primary={canonical ? "Continue" : "Save changes"} onPrimary={() => void save()} busy={busy} />}>
    <Heading title="Which industries or product areas interest you?" subtitle="Select one or more. You can change this later." />
    <View style={local.grid}>{interestOptions.map(([label, icon]) => <Pressable key={label} onPress={() => setItems(toggle(items, label!))} style={[local.interest, items.includes(label!) && local.interestOn]}><Text style={local.interestIcon}>{icon}</Text><Text style={[local.interestLabel, items.includes(label!) && { color: C.blue }]}>{label}</Text>{items.includes(label!) ? <Text style={local.check}>✓</Text> : null}</Pressable>)}</View>
    <Field label="Something else?" value={custom} onChangeText={setCustom} placeholder="Add your own interest" returnKeyType="done" onSubmitEditing={addCustom} />
    {items.filter(x => !interestOptions.some(([known]) => known === x)).map(x => <Chip key={x} label={`${x}  ×`} onPress={() => setItems(items.filter(i => i !== x))} />)}
    {error ? <Notice tone="red">{error}</Notice> : null}
  </Frame>;
}

function PreferencesScreen({ token, state, update, canonical, back }: Common) {
  const presets = [{ label: "3 months", days: 90 }, { label: "6 months", days: 180 }, { label: "9 months", days: 270 }, { label: "12 months", days: 365 }] as const;
  const savedDays = state.preferences.timelineDays;
  const initialPreset = presets.find(option => option.days === savedDays)?.days ?? (savedDays ? "custom" : 90);
  const [timelineChoice, setTimelineChoice] = useState<number | "custom">(initialPreset);
  const [customValue, setCustomValue] = useState(savedDays && initialPreset === "custom" ? savedDays.toString() : "");
  const [customUnit, setCustomUnit] = useState<"days" | "months">("days");
  const [pace, setPace] = useState<Pace | null>(state.preferences.pace); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function save() {
    const amount = Number(customValue);
    const timeline = timelineChoice === "custom" ? (customUnit === "months" ? Math.round(amount * 30) : amount) : timelineChoice;
    if (!Number.isInteger(timeline) || timeline < 1 || timeline > 3650) return setError("Choose a timeline between 1 and 3650 days.");
    if (!pace) return setError("Choose a learning pace.");
    setBusy(true); setError(""); try { let next = await api.preferences(token, state, timeline, pace); if (canonical) next = await api.advance(token, next); update(next); } catch (e) { await recover(e, token, update, setError); } finally { setBusy(false); }
  }
  return <Frame step={6} back={back} footer={<Footer primary={canonical ? "Continue" : "Save changes"} onPrimary={() => void save()} busy={busy} />}>
    <Heading title="Choose your timeline and pace" subtitle="Set a rhythm that fits your real life. You can adjust it later." />
    <Text style={ui.label}>Target timeline</Text>
    <View style={local.wrap}>{presets.map(option => <Chip key={option.days} label={option.label} selected={timelineChoice === option.days} onPress={() => { setTimelineChoice(option.days); setError(""); }} />)}<Chip label="Custom" selected={timelineChoice === "custom"} onPress={() => { setTimelineChoice("custom"); setError(""); }} /></View>
    {timelineChoice === "custom" ? <View style={local.customTimeline}><View style={{ flex: 1 }}><Field label="Custom timeline" value={customValue} onChangeText={setCustomValue} keyboardType="number-pad" placeholder={customUnit === "days" ? "Enter days" : "Enter months"} /></View><View><Text style={ui.label}>Unit</Text><View style={local.wrap}><Chip label="Days" selected={customUnit === "days"} onPress={() => setCustomUnit("days")} /><Chip label="Months" selected={customUnit === "months"} onPress={() => setCustomUnit("months")} /></View></View></View> : null}
    <Text style={[ui.label, { marginTop: 12 }]}>Learning pace</Text>
    <Choice title="Casual" detail="A little progress each week" icon="🌿" selected={pace === "CASUAL"} onPress={() => setPace("CASUAL")} />
    <Choice title="Steady" detail="A consistent, balanced routine" icon="⚡" selected={pace === "STEADY"} onPress={() => setPace("STEADY")} />
    <Choice title="Intensive" detail="A faster cadence with more learning work" icon="🚀" selected={pace === "INTENSIVE"} onPress={() => setPace("INTENSIVE")} />
    {error ? <Notice tone="red">{error}</Notice> : null}
  </Frame>;
}

function ReviewScreen({ token, state, update, back, edit, onComplete }: { token: string; state: OnboardingState; update: Common["update"]; back?: () => void; edit: (s: ViewStep) => void; onComplete: (s: OnboardingState) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const rows = useMemo(() => [
    ["About you", `${state.profile.displayName} · ${state.profile.currentRole} · ${state.profile.experienceYears} years`, "profile"],
    ["Resume", state.resume?.filename || "Skipped", "resume"],
    ["Skills", state.skills.length ? state.skills.map(x => x.name).join(", ") : "Starting fresh", "skills"],
    ["Goal", state.goal?.target || "—", "goal"],
    ["Interests", state.interests.join(", ") || "Skipped", "interests"],
    ["Plan", `${state.preferences.timelineDays} days · ${state.preferences.pace?.toLowerCase()}`, "preferences"],
  ] as const, [state]);
  async function finish() { setBusy(true); setError(""); try { let next = state; if (next.currentStep === "review") next = await api.complete(token, next); update(next); onComplete(next); } catch (e) { await recover(e, token, update, setError); } finally { setBusy(false); } }
  return <Frame step={7} back={back} footer={<Footer primary="Finish setup" onPrimary={() => void finish()} busy={busy} />}>
    <Heading title="You’re ready to begin" subtitle="Review your setup. Your learning path will use this profile as its starting point." />
    {rows.map(([title, value, destination]) => <Pressable key={title} onPress={() => edit(destination)} style={local.review}><View style={{ flex: 1 }}><Text style={local.reviewTitle}>{title}</Text><Text style={local.reviewValue} numberOfLines={3}>{value}</Text></View><Text style={local.edit}>Edit</Text></Pressable>)}
    <Notice tone="green">✓ Your progress is saved. You can close the app and continue from this point.</Notice>{error ? <Notice tone="red">{error}</Notice> : null}
  </Frame>;
}

function PaymentOffer({ state, price, error, busy, onPurchase, onBack }: { state: OnboardingState; price?: string; error: string; busy: boolean; onPurchase: () => void; onBack: () => void }) {
  const displayPrice = price || "Loading price…";
  const timeline = state.preferences.timelineDays ? formatTimeline(state.preferences.timelineDays) : "Flexible";
  const strongest = state.skills.find(skill => skill.level === "DEEP" || skill.level === "PRODUCTION") || state.skills[0];
  const goal = state.goal?.target || "Build my next skill";
  return <Screen>
    <View style={local.offerTop}><Pressable onPress={onBack} style={ui.backTop}><Text style={ui.backTopText}>‹</Text></Pressable><Brand compact /><View style={{ width: 36 }} /></View>
    <View style={{ marginTop: 20 }}><Heading title="Start your\npersonalized path" subtitle="Unlock your first adaptive bundle before we generate your detailed learning path." /></View>

    <View style={local.profileCard}>
      <View style={local.profileHeader}><View style={local.profileIcon}><Text style={{ fontSize: 20 }}>♙</Text></View><Text style={local.profileTitle}>Your Learning Profile</Text><Text style={local.edit}>✎ Edit</Text></View>
      <SummaryRow icon="◎" label="Goal" value={shortenGoal(goal)} />
      <SummaryRow icon="▣" label="Timeline" value={timeline} />
      <SummaryRow icon="▥" label="Current strength" value={strongest ? strongest.name : "Starting fresh"} />
      <SummaryRow icon="♡" label="Interest" value={state.interests.slice(0, 2).join(" / ") || "Open to explore"} />
    </View>

    <LinearGradient colors={["#F5FAFF", "#FFFFFF"]} style={local.offerCard}>
      <View style={local.offerHeading}><View style={local.cube}><Text style={{ fontSize: 25 }}>◇</Text></View><View style={{ flex: 1 }}><Text style={local.offerTitle}>Try It with Labs</Text><Text style={local.bestStep}>Best first step</Text></View><View><Text style={local.price}>{displayPrice}</Text><Text style={local.oneTime}>one-time</Text></View></View>
      {["2 personalized learning units", "2 practical labs", "adaptive explanations around your gaps", "notes, markers and saved words included"].map(item => <View key={item} style={local.benefit}><Text style={local.tick}>✓</Text><Text style={local.benefitText}>{item}</Text></View>)}
    </LinearGradient>

    <Text style={local.later}>Later options</Text>
    <View style={local.bundleRow}>
      <Bundle icon="▣" title="Small Bundle" detail="focused skill path" />
      <Bundle icon="▥" title="Deep Bundle" detail="larger role transition path" />
    </View>

    {error ? <Notice tone="red">{error}</Notice> : null}
    <PrimaryButton label={busy ? "Opening secure checkout…" : price ? `Continue to Pay ${price}` : "Loading store price…"} onPress={onPurchase} disabled={!price || busy} />
    <Text style={local.upgrade}>♢  Upgrade later if you want a bigger path.</Text>
  </Screen>;
}

function Home({ state, pending, price, error, busy, onUnlock, onRestore, onBilling, onLogout }: { state: OnboardingState; pending: boolean; price?: string; error: string; busy: boolean; onUnlock: () => void; onRestore: () => void; onBilling: () => void; onLogout: () => void }) {
  const displayPrice = price || "Loading…";
  const timeline = state.preferences.timelineDays ? formatTimeline(state.preferences.timelineDays) : "Flexible";
  const strongest = state.skills.find(skill => skill.level === "DEEP" || skill.level === "PRODUCTION") || state.skills[0];
  return <View style={local.homeRoot}>
    <Screen>
      <View style={local.homeHeader}>
        <Pressable onPress={onBilling}><Text style={local.headerIcon}>☰</Text></Pressable>
        <Brand compact />
        <Pressable onPress={() => Alert.alert("Notifications", "You have no new notifications.")}><Text style={local.headerIcon}>♧</Text></Pressable>
      </View>
      <View style={local.beforePurchase}><Text style={local.beforePurchaseText}>Before purchase</Text></View>
      <View style={local.greetingRow}><View style={{ flex: 1 }}><Text style={local.greeting}>Good morning, {state.profile.displayName || "learner"} 👋</Text><Text style={local.greetingSub}>Your path to {state.profile.currentRole || "your next role"} is ready.</Text></View><Text style={local.personAvatar}>👩🏻‍💻</Text></View>

      <View style={local.directionCard}>
        <View style={local.directionTitleRow}><View style={local.targetCircle}><Text style={{ fontSize: 23 }}>◎</Text></View><View style={{ flex: 1 }}><Text style={local.directionTitle}>Your direction is ready</Text><Text style={local.directionSub}>We’ve created a personalized learning path based on your profile.</Text></View></View>
        <SummaryRow icon="▣" label="Goal" value={shortenGoal(state.goal?.target || "Build my next skill")} />
        <SummaryRow icon="‹/›" label="Current strength" value={strongest?.name || "Starting fresh"} />
        <SummaryRow icon="♥" label="Interests" value={state.interests.slice(0, 2).join(" / ") || "Open to explore"} />
        <SummaryRow icon="▥" label="Target pace" value={timeline} />
      </View>

      <View style={local.homePlanCard}>
        <View style={local.planHeading}><View style={local.crown}><Text>♛</Text></View><Text style={local.planTitle}>Try It Plan</Text><Text style={local.planPrice}>{displayPrice} one-time</Text></View>
        <Text style={local.planCopy}>Get a focused preview of your personalized learning experience.</Text>
        {["2 personalized learning units", "2 practical labs", "Up to 2 adaptive extensions"].map(item => <View key={item} style={local.benefit}><Text style={local.tick}>✓</Text><Text style={local.benefitText}>{item}</Text></View>)}
        {error ? <Notice tone="red">{error}</Notice> : null}
        <View style={{ marginTop: 14 }}><PrimaryButton label={pending ? (busy ? "Checking purchase…" : "Restore Purchase") : price ? `Unlock with ${price}` : "Loading store price…"} onPress={pending ? onRestore : onUnlock} disabled={busy || (!pending && !price)} /></View>
        <Pressable style={local.previewButton} onPress={() => Alert.alert("Preview Module 1", "The learning module preview belongs to the next product layer.")}><Text style={local.previewText}>⊙  Preview Module 1</Text></Pressable>
        <Text style={local.locked}>♙  Learning content is locked until purchase.</Text>
      </View>
      <Pressable onPress={onLogout}><Text style={local.signOut}>Sign out</Text></Pressable>
    </Screen>
  </View>;
}

function ContinuationOffer({token,appUserId,onBack,onSuccess}:{token:string;appUserId:string;onBack:()=>void;onSuccess:()=>Promise<void>}){
  const[state,setState]=useState<ContinuationState|null>(null),[offer,setOffer]=useState<StoreOffer|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState("");
  useEffect(()=>{let active=true;const country=getLocales()[0]?.regionCode?.toUpperCase()??null;api.continuation(token).then(async next=>{if(!next.nextOffer?.available||!next.nextOffer.revenueCatPackageId)throw new Error("The continuation offer is not available.");const loaded=await loadRevenueCatOffer(appUserId,next.nextOffer.revenueCatOfferingId,country,next.nextOffer.revenueCatPackageId);if(active){setState(next);setOffer(loaded);}}).catch(e=>active&&setError(message(e))).finally(()=>active&&setBusy(false));return()=>{active=false;};},[token,appUserId]);
  async function finish(customerInfo?:Awaited<ReturnType<typeof restoreRevenueCatPurchases>>){if(!state?.nextOffer)return;if(customerInfo&&!customerInfo.entitlements.active[state.nextOffer.entitlementKey])throw new Error("No active continuation purchase was found for this account.");await api.reconcileContinuationPurchase(token);await onSuccess();}
  async function purchase(){if(!offer||!state?.nextOffer)return;setBusy(true);setError("");let attempt:string|null=null,sdkSucceeded=false;try{const intent=await api.continuationPurchaseIntent(token,offer.countryCode??undefined);attempt=intent.purchaseAttemptId;if(intent.status==="ALREADY_ACTIVE"){await finish();return;}const result=await purchaseRevenueCatPackage(offer.package);if(!result.customerInfo.entitlements.active[intent.entitlementKey])throw new Error("RevenueCat completed the purchase but the growth entitlement is not active.");sdkSucceeded=true;await finish(result.customerInfo);}catch(e){const failure=revenueCatFailure(e);if(attempt&&!sdkSucceeded)await api.continuationPurchaseOutcome(token,attempt,failure.cancelled?"CANCELLED":"FAILED",failure.code).catch(()=>undefined);setError(failure.cancelled?"Purchase cancelled. Your proposed runway is saved and remains locked.":failure.message);}finally{setBusy(false);}}
  async function restoreGrowth(){setBusy(true);setError("");try{await finish(await restoreRevenueCatPurchases());}catch(e){setError(message(e));}finally{setBusy(false);}}
  return <Screen><View style={local.offerTop}><Pressable onPress={onBack} style={ui.backTop}><Text style={ui.backTopText}>‹</Text></Pressable><Brand compact/><View style={{width:32}}/></View><Text style={local.greeting}>Continue your learning</Text><Text style={local.greetingSub}>Your trial is complete. Continue with the next personalized runway prepared from your progress, evidence and unresolved learning needs.</Text>{busy&&!state?<ActivityIndicator color={C.blue}/>:null}{state?.nextOffer?<View style={local.homePlanCard}><Text style={local.planTitle}>Next runway</Text><Text style={local.planCopy}>{state.nextOffer.plannedUnits} learning units · {state.nextOffer.plannedLabs} practical labs</Text>{state.nextRoadmap?.map(item=><View key={item.sequence} style={local.learningUnitRow}><View style={local.learningUnitNumber}><Text style={local.learningUnitNumberText}>🔒</Text></View><View style={{flex:1}}><Text style={local.rowTitle}>Unit {item.sequence}: {item.title}</Text><Text style={local.rowDetail}>{item.summary}</Text><Text style={local.learningMeta}>{item.concepts.join(" · ")}</Text></View></View>)}<Text style={local.planCopy}>Detailed teaching and labs remain locked and are prepared progressively after verified access.</Text>{error?<Notice tone="red">{error}</Notice>:null}<PrimaryButton label={offer?`Continue with ${offer.priceString}`:"Loading store price…"} disabled={!offer||busy} busy={busy} onPress={()=>void purchase()}/><Pressable onPress={()=>void restoreGrowth()} disabled={busy}><Text style={local.previewText}>Restore purchase</Text></Pressable></View>:error?<Notice tone="red">{error}</Notice>:null}</Screen>;
}

function PaidHome({ token, state, home, onContinue, onOpenUnit, onOpenLab, onNotes, onBilling, onLogout }: { token: string; state: OnboardingState; home:HomeState; onContinue: () => void; onOpenUnit:(unit:LearningUnit)=>void; onOpenLab:(labId:string)=>void; onNotes:()=>void; onBilling: () => void; onLogout: () => void }) {
  const [continuation,setContinuation]=useState<import("./types").ContinuationState|null>(null);
  const [units,setUnits]=useState<LearningUnit[]>([]);
  const [completedLabs,setCompletedLabs]=useState(0);
  const [unitsLoading,setUnitsLoading]=useState(true);
  const [pathExpanded,setPathExpanded]=useState(false);
  const [drawerOpen,setDrawerOpen]=useState(false);
  const [drawerPage,setDrawerPage]=useState<"menu"|"words"|"help"|"settings">("menu");
  const [savedWords,setSavedWords]=useState<import("./types").MarkedWord[]>([]);
  const [notesLoading,setNotesLoading]=useState(false);
  useEffect(()=>{
    let active=true;
    setUnitsLoading(true);
    Promise.all([api.learningUnits(token),api.continuation(token).catch(()=>null),api.labHistory(token)]).then(async([value,next,labs])=>{
      if(!active)return;
      setUnits(value);setCompletedLabs(labs.filter(lab=>lab.status==="COMPLETE").length);
      if(next?.nextAction==="REVIEW_NEXT_RUNWAY"){try{next=await api.analyzeContinuation(token);}catch{/* Keep the completed runway visible and allow a safe retry. */}}
      if(active)setContinuation(next);
    }).catch(()=>{if(active)setUnits([]);}).finally(()=>{if(active)setUnitsLoading(false);});
    return()=>{active=false;};
  },[token]);
  const learningReady=units.length>0||Boolean(home.learningState&&home.primaryAction.type!=="CONTINUE_TRIAL_SETUP");
  const activeAction=continuation?.nextAction??home.primaryAction.type;
  const completedUnits=units.filter(unit=>unit.status==="COMPLETE");
  const hasCompletedTrial=completedUnits.length>=2;
  const runwayComplete=hasCompletedTrial&&["REVIEW_NEXT_RUNWAY","VIEW_NEXT_RUNWAY","WAIT_REFRESH"].includes(activeAction);
  const completedRunwayTitle=continuation?.commercialProductKey==="TRY_IT"?"Trial complete":"Learning runway complete";
  const currentUnit=units.find(unit=>unit.unitId===continuation?.nextUnitId)??units.find(unit=>unit.status!=="COMPLETE"&&unit.status!=="LOCKED")??units[0]??null;
  const labAction=activeAction==="START_LAB"||activeAction==="RESUME_LAB";
  const actionLabel=activeAction==="DOUBT_CLEARANCE"?"Open Doubt Clearance":activeAction==="START_LAB"?"Start lab":activeAction==="RESUME_LAB"?"Resume lab":activeAction==="VIEW_NEXT_RUNWAY"?"Unlock next runway":"Continue learning";
  const actionTitle=activeAction==="DOUBT_CLEARANCE"?"Clear your learning doubts":activeAction==="START_LAB"?"Start your practical lab":activeAction==="RESUME_LAB"?"Resume your practical lab":activeAction==="VIEW_NEXT_RUNWAY"?"Your next runway is ready":"Continue your learning";
  const actionCopy=currentUnit?`Unit ${currentUnit.sequence}: ${currentUnit.title}`:"Your saved learning progress is ready.";
  const openCurrent=()=>{if(["REVIEW_NEXT_RUNWAY","VIEW_NEXT_RUNWAY","WAIT_REFRESH"].includes(activeAction))onContinue();else if(labAction&&continuation?.nextLabId)onOpenLab(continuation.nextLabId);else if(currentUnit)onOpenUnit(currentUnit);else onContinue();};
  const collapsedUnits=(completedUnits.length?completedUnits:currentUnit?[currentUnit]:[]).sort((left,right)=>left.sequence-right.sequence);
  const visibleUnits=pathExpanded?units:collapsedUnits.length?collapsedUnits:units.slice(0,1);
  async function openWords(){setDrawerPage("words");setNotesLoading(true);try{setSavedWords(await api.markedWords(token));}finally{setNotesLoading(false);}}
  return <View style={local.homeRoot}><Screen>
    <View style={local.homeHeader}><Pressable accessibilityLabel="Open menu" onPress={()=>{setDrawerPage("menu");setDrawerOpen(true);}}><Text style={local.headerIcon}>☰</Text></Pressable><Brand compact /><Pressable accessibilityLabel="Notifications" onPress={()=>Alert.alert("Notifications","You have no new notifications.")}><Text style={local.notificationIcon}>🔔</Text><View style={local.notificationDot}/></Pressable></View>
    <View style={local.paidGreeting}><View style={{ flex: 1 }}><View style={local.unlockedPill}><Text style={local.unlockedText}>●  {learningReady?"Trial active":"Trial unlocked"}</Text></View><Text style={[local.greeting,{marginTop:10}]}>Welcome back, {state.profile.displayName || "learner"} 👋</Text><Text style={local.greetingSub}>{learningReady?"Ready to keep learning?":`Aspiring ${state.profile.currentRole || "Learner"}`}</Text></View><Text style={local.personAvatar}>{learningReady?"🙋🏻‍♀️":"👩🏻"}</Text></View>
    {unitsLoading?<View style={local.homeLoading}><ActivityIndicator color={C.blue}/><Text style={local.greetingSub}>Loading your saved learning path…</Text></View>:learningReady?<>
      {runwayComplete?<View style={local.activeNextCard}>
        <View style={local.activeTitleRow}><View style={local.rocketCircle}><Text style={local.rocket}>✓</Text></View><View style={{flex:1}}><Text style={local.activeTitle}>{completedRunwayTitle}</Text><Text style={local.activeCopy}>{completedUnits.length} units completed · {completedLabs} labs completed</Text><Text style={local.activeCopy}>Your results and evidence are saved. Review the next roadmap below.</Text></View></View>
      </View>:<View style={local.activeNextCard}>
        <View style={local.activeTitleRow}><View style={local.rocketCircle}><Text style={local.rocket}>{labAction?"⚗":"🚀"}</Text></View><View style={{flex:1}}><Text style={local.activeTitle}>{actionTitle}</Text><Text style={local.activeCopy}>{actionCopy}</Text><Text style={local.activeCopy}>Your progress is saved. Continue exactly where you stopped.</Text></View></View>
        <PrimaryButton label={actionLabel} onPress={openCurrent}/>
      </View>}
      <View style={local.learningStatusCard}>
        <View style={local.setupHeading}><Text style={local.setupTitle}>{completedUnits.length?"Completed units":continuation?.commercialProductKey==="TRY_IT"?"Your trial learning path":"Your learning path"}</Text><Text style={local.forYou}>✦ Just for you</Text></View>
        {visibleUnits.map(unit=><Pressable key={unit.unitId} disabled={unit.status==="LOCKED"} onPress={()=>onOpenUnit(unit)} style={[local.learningUnitRow,unit.status==="LOCKED"&&{opacity:.55}]}><View style={local.learningUnitNumber}><Text style={local.learningUnitNumberText}>{unit.sequence}</Text></View><View style={{flex:1}}><Text style={local.rowTitle}>{unit.title}</Text><Text style={local.rowDetail} numberOfLines={2}>{unit.goal}</Text><Text style={local.learningMeta}>{unitStatusLabel(unit.status)} · {unit.concepts.length} concepts · practical lab included</Text></View><Text style={local.learningChevron}>›</Text></Pressable>)}
        {units.length>visibleUnits.length||pathExpanded?<Pressable accessibilityRole="button" onPress={()=>setPathExpanded(value=>!value)} style={{minHeight:42,alignItems:"center",justifyContent:"center",borderTopWidth:1,borderTopColor:"#EDF1F6",marginTop:4}}><Text style={{color:C.blue,fontSize:12,fontWeight:"800"}}>{pathExpanded?"Show completed and current":`View all ${units.length} units`}  {pathExpanded?"↑":"↓"}</Text></Pressable>:null}
      </View>
      {hasCompletedTrial?<View style={local.learningStatusCard}>
        <View style={local.setupHeading}><View style={{flex:1}}><Text style={local.setupTitle}>Next learning runway</Text><Text style={local.rowDetail}>{continuation?.nextRoadmap?.length?"Prepared from your progress, evidence, doubts and remaining scope.":"Preparing a roadmap from your completed trial evidence…"}</Text></View><Text style={local.forYou}>Adaptive</Text></View>
        {continuation?.nextRoadmap?.map(item=>{const materialized=units.find(unit=>unit.sequence===item.sequence);const locked=item.status==="LOCKED"||!materialized;return <Pressable key={item.sequence} disabled={locked} onPress={()=>materialized&&onOpenUnit(materialized)} style={[local.learningUnitRow,locked&&{opacity:.6}]}><View style={local.learningUnitNumber}><Text style={local.learningUnitNumberText}>{locked?"🔒":item.sequence}</Text></View><View style={{flex:1}}><Text style={local.rowTitle}>Unit {item.sequence}: {item.title}</Text><Text style={local.rowDetail}>{item.summary}</Text><Text style={local.learningMeta}>{unitStatusLabel(item.status)} · {item.concepts.join(" · ")}</Text></View>{!locked?<Text style={local.learningChevron}>›</Text>:null}</Pressable>;})}
        {runwayComplete?<PrimaryButton label={activeAction==="VIEW_NEXT_RUNWAY"?"Unlock next runway":activeAction==="WAIT_REFRESH"?"Preparing access…":"Retry roadmap"} disabled={activeAction==="WAIT_REFRESH"} onPress={openCurrent}/>:null}
      </View>:null}
    </>:<>
      <LinearGradient colors={["#F0F7FF", "#F8FBFF"]} style={local.trialHero}><Text style={local.eyebrow}>YOUR NEXT STEP</Text><Text style={local.trialHeroTitle}>Your trial is ready to shape ✦</Text><Text style={local.trialHeroCopy}>Add optional target context, confirm your learning scope, and generate your first two units.</Text><View style={local.trialHeroActions}><View style={{ flex: 1 }}><PrimaryButton label="Continue setup" onPress={onContinue} /></View><Pressable onPress={() => Alert.alert("Saved", "You can continue later.")}><Text style={local.maybeLater}>Maybe later</Text></Pressable></View></LinearGradient>
      <View style={local.setupCard}><View style={local.setupHeading}><Text style={local.setupTitle}>Trial setup</Text><Text style={local.setupCount}>4 of 7 complete</Text></View>{[
        ["Profile", "Tell us about yourself", true], ["Skills", "Your current skills and experience", true], ["Goal", shortenGoal(state.goal?.target || "Your learning goal"), true], ["Payment", "Trial purchase activated", true], ["Job description / target company", "Optional, for a more tailored path", false], ["Learning scope", "Choose focus areas and depth", false], ["Generate first 2 units", "We’ll create your personalised learning plan", false],
      ].map(([title,detail,done])=><SetupRow key={String(title)} title={String(title)} detail={String(detail)} done={Boolean(done)}/>)}</View>
      <LinearGradient colors={["#F7F7FF", "#F0F4FF"]} style={local.nextCard}><View style={local.setupHeading}><View><Text style={local.setupTitle}>What happens next</Text><Text style={local.greetingSub}>We’ll generate exactly two focused learning units from your confirmed scope.</Text></View><Text style={local.forYou}>✦ Just for you</Text></View><PreviewRow icon="▤" title="Your focused learning units" detail="They’ll appear here after your learning scope is confirmed and generation is complete."/><PreviewRow icon="♜" title="2 practical labs included" detail="Hands-on projects to apply what you learn."/></LinearGradient>
    </>}
  </Screen>
    <HomeDrawer visible={drawerOpen} page={drawerPage} state={state} words={savedWords} notesLoading={notesLoading} onPage={setDrawerPage} onClose={()=>setDrawerOpen(false)} onBack={()=>setDrawerPage("menu")} onNotes={()=>{setDrawerOpen(false);onNotes();}} onWords={()=>void openWords()} onBilling={()=>{setDrawerOpen(false);onBilling();}} onLogout={()=>{setDrawerOpen(false);onLogout();}}/>
  </View>;
}

type NoteCategory="ALL"|"UNIT"|"CONCEPT"|"LAB"|"TEXT_CODE";
const noteCategories:{key:NoteCategory;label:string}[]=[{key:"ALL",label:"All"},{key:"UNIT",label:"Units"},{key:"CONCEPT",label:"Concepts"},{key:"LAB",label:"Labs"},{key:"TEXT_CODE",label:"Text & code"}];

function SavedNotesPage({token,onBack,onOpenUnit,onOpenLab}:{token:string;onBack:()=>void;onOpenUnit:(unit:LearningUnit)=>void;onOpenLab:(labId:string)=>void}){
  const[query,setQuery]=useState(""),[category,setCategory]=useState<NoteCategory>("ALL"),[notes,setNotes]=useState<LearningNote[]>([]),[units,setUnits]=useState<LearningUnit[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
  useEffect(()=>{let active=true;api.learningUnits(token).then(value=>active&&setUnits(value)).catch(()=>undefined);return()=>{active=false;};},[token]);
  useEffect(()=>{let active=true;const timer=setTimeout(()=>{setLoading(true);setError("");api.notes(token,query).then(value=>{if(active)setNotes(value);}).catch(reason=>{if(active)setError(message(reason));}).finally(()=>{if(active)setLoading(false);});},250);return()=>{active=false;clearTimeout(timer);};},[token,query]);
  const filtered=useMemo(()=>notes.filter(note=>category==="ALL"||noteCategory(note)===category),[notes,category]);
  const recent=query.trim()||category!=="ALL"?[]:notes.slice(0,3);
  const openSource=(note:LearningNote)=>{if(note.labId){onOpenLab(note.labId);return;}const unit=units.find(item=>item.unitId===note.unitId);if(unit)onOpenUnit(unit);};
  const card=(note:LearningNote)=><View key={note.noteId} style={local.noteCard}><View style={local.noteMeta}><Text style={local.noteType}>{noteCategoryLabel(note)}</Text><Text style={local.noteDate}>{formatNoteDate(note.updatedAt)}</Text></View>{note.selectedText?<Text style={local.noteQuote}>“{note.selectedText}”</Text>:null}<Text style={local.noteBody}>{note.body}</Text><Text style={local.noteSource}>{noteSourceLabel(note,units)}</Text>{note.unitId||note.labId?<Pressable accessibilityRole="button" onPress={()=>openSource(note)} style={local.noteOpen}><Text style={local.noteOpenText}>Open saved context  →</Text></Pressable>:null}</View>;
  return <Screen><View style={local.notesHeader}><Pressable accessibilityLabel="Back to Home" onPress={onBack} style={ui.backTop}><Text style={ui.backTopText}>←</Text></Pressable><Brand compact/><View style={{width:36}}/></View><Text style={local.notesEyebrow}>YOUR LEARNING CONTEXT</Text><Text style={local.notesTitle}>Saved Notes</Text><Text style={local.notesIntro}>Search every note you saved from concepts, teaching text, code and labs.</Text><Field label="Search notes" value={query} onChangeText={setQuery} placeholder="Search notes or selected text" returnKeyType="search"/><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={local.noteFilters}>{noteCategories.map(item=><Pressable key={item.key} onPress={()=>setCategory(item.key)} style={[local.noteFilter,category===item.key&&local.noteFilterOn]}><Text style={[local.noteFilterText,category===item.key&&local.noteFilterTextOn]}>{item.label}</Text></Pressable>)}</ScrollView>{error?<Notice tone="red">{error}</Notice>:null}{loading?<View style={local.notesLoading}><ActivityIndicator color={C.blue}/><Text style={local.drawerItemDetail}>Loading saved notes…</Text></View>:<>{recent.length?<View style={local.noteSection}><Text style={local.noteSectionTitle}>Recent notes</Text>{recent.map(card)}</View>:null}<View style={local.noteSection}><View style={local.noteSectionHeading}><Text style={local.noteSectionTitle}>{category==="ALL"?"All notes":noteCategories.find(item=>item.key===category)?.label}</Text><Text style={local.noteCount}>{filtered.length}</Text></View>{filtered.length?filtered.map(card):<View style={local.emptyNotes}><Text style={local.emptyNotesIcon}>▤</Text><Text style={local.drawerItemTitle}>No matching notes</Text><Text style={local.drawerItemDetail}>{query?"Try another search or note type.":"Select teaching text and choose Add note. Your notes will appear here."}</Text></View>}</View></>}</Screen>;
}

function noteCategory(note:LearningNote):Exclude<NoteCategory,"ALL">{if(note.sourceType.startsWith("LAB"))return"LAB";if(note.sourceType==="CONCEPT_SECTION")return"CONCEPT";if(["WORD","PHRASE","SENTENCE","PARAGRAPH","CODE_LINE","CODE_SELECTION"].includes(note.sourceType))return"TEXT_CODE";return"UNIT";}
function noteCategoryLabel(note:LearningNote){return noteCategory(note)==="TEXT_CODE"?"Text & code":noteCategory(note)[0]+noteCategory(note).slice(1).toLowerCase();}
function noteSourceLabel(note:LearningNote,units:LearningUnit[]){const unit=units.find(item=>item.unitId===note.unitId);const concept=unit?.concepts.find(item=>item.conceptId===note.conceptId);return concept&&unit?`${unit.title} · ${concept.name}`:unit?.title??(note.labId?"Saved lab context":"Saved learning context");}
function formatNoteDate(value:string){const date=new Date(value);return Number.isNaN(date.valueOf())?"Saved":date.toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"});}

function HomeDrawer({visible,page,state,words,notesLoading,onPage,onClose,onBack,onNotes,onWords,onBilling,onLogout}:{visible:boolean;page:"menu"|"words"|"help"|"settings";state:OnboardingState;words:import("./types").MarkedWord[];notesLoading:boolean;onPage:(page:"menu"|"words"|"help"|"settings")=>void;onClose:()=>void;onBack:()=>void;onNotes:()=>void;onWords:()=>void;onBilling:()=>void;onLogout:()=>void}){
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={local.drawerOverlay}>
    <Pressable style={local.drawerDismiss} onPress={onClose}/><SafeAreaView edges={["top","bottom","left"]} style={local.drawer}>
      <View style={local.drawerHeader}>{page!=="menu"?<Pressable onPress={onBack}><Text style={local.drawerClose}>←</Text></Pressable>:<Brand compact/>}<Pressable accessibilityLabel="Close menu" onPress={onClose}><Text style={local.drawerClose}>×</Text></Pressable></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={local.drawerScroll}>
      {page==="words"?<><Text style={local.drawerTitle}>Marked Words</Text>{notesLoading?<ActivityIndicator color={C.blue}/>:words.length?<View>{words.map(word=><View key={word.markedWordId} style={local.drawerNote}><Text style={local.drawerItemTitle}>{word.selectedText}</Text><Text style={local.drawerItemDetail}>{word.simpleMeaning}</Text><Text numberOfLines={3} style={local.drawerItemDetail}>{word.technicalMeaning}</Text></View>)}</View>:<View style={local.emptyNotes}><Text style={local.emptyNotesIcon}>Aa</Text><Text style={local.drawerItemTitle}>No marked words yet</Text><Text style={local.drawerItemDetail}>Mark a word while learning and it will appear here.</Text></View>}</>:null}
      {page==="help"?<><Text style={local.drawerTitle}>Help & Support</Text><DrawerPanelRow icon="▤" title="Frequently Asked Questions" detail="Quick answers to common account, learning and lab questions."/><DrawerPanelRow icon="!" title="Report an issue" detail="Tell us when something is not working as expected."/><DrawerPanelRow icon="□" title="Contact Support" detail="Get in touch with the AdaptiveSkills team."/><DrawerPanelRow icon="?" title="Learning Guidance" detail="Tips for getting the most from concepts and labs."/></>:null}
      {page==="settings"?<><Text style={local.drawerTitle}>Settings</Text><DrawerPanelRow icon="☼" title="Appearance" detail="Light mode"/><DrawerPanelRow icon="🔔" title="Notifications" detail="Manage learning reminders."/><DrawerPanelRow icon="◎" title="Language" detail="English (US)"/><DrawerPanelRow icon="◇" title="Privacy" detail="Control your data and privacy settings."/><DrawerPanelRow icon="♙" title="Account" detail="Manage your account details."/></>:null}
      {page==="menu"?<>
        <View style={local.drawerProfile}><Text style={local.drawerAvatar}>👩🏻</Text><View style={{flex:1}}><Text style={local.drawerName}>{state.profile.displayName||"Learner"}</Text><Text style={local.drawerRole}>{state.profile.currentRole||state.goal?.target||"Learner"}</Text></View></View>
        <View style={local.drawerDivider}/><DrawerItem icon="▤" title="Saved Notes" onPress={onNotes}/><DrawerItem icon="Aa" title="Marked Words" onPress={onWords}/><DrawerItem icon="?" title="Help & Support" onPress={()=>onPage("help")}/><DrawerItem icon="⚙" title="Settings" onPress={()=>onPage("settings")}/><DrawerItem icon="▣" title="Billing" onPress={onBilling}/><View style={local.drawerDivider}/><DrawerItem icon="↪" title="Sign out" onPress={onLogout}/>
        <View style={local.drawerBrandMessage}><Text style={local.drawerBrandMark}>A</Text><Text style={local.drawerBrandText}>Smarter learning, brighter tomorrows.</Text></View>
      </>:null}
      </ScrollView>
    </SafeAreaView>
  </View></Modal>;

}

function DrawerItem({icon,title,onPress}:{icon:string;title:string;onPress:()=>void}){return <Pressable onPress={onPress} style={local.drawerItem}><Text style={local.drawerItemIcon}>{icon}</Text><Text style={local.drawerItemTitle}>{title}</Text><Text style={local.drawerChevron}>›</Text></Pressable>}
function DrawerPanelRow({icon,title,detail}:{icon:string;title:string;detail:string}){return <View style={local.drawerPanelRow}><Text style={local.drawerPanelIcon}>{icon}</Text><View style={{flex:1}}><Text style={local.drawerItemTitle}>{title}</Text><Text style={local.drawerItemDetail}>{detail}</Text></View><Text style={local.drawerChevron}>›</Text></View>}
function Billing({ token, onBack }: { token: string; onBack: () => void }) {
  const [billing, setBilling] = useState<BillingState | null>(null); const [error, setError] = useState("");
  useEffect(() => { api.billing(token).then(setBilling).catch(e => setError(message(e))); }, [token]);
  return <Screen><View style={local.offerTop}><Pressable onPress={onBack} style={ui.backTop}><Text style={ui.backTopText}>‹</Text></Pressable><Brand compact /><Text style={local.headerIcon}>♧</Text></View><Text style={local.billingTitle}>‹  Billing</Text>
    {!billing && !error ? <ActivityIndicator color={C.blue} /> : null}{error ? <Notice tone="red">{error}</Notice> : null}
    {billing ? <>{billing.purchase ? <><View style={local.billingPlan}><View style={local.billingBag}><Text style={{ color: C.blue, fontSize: 22 }}>♙</Text></View><View style={{ flex: 1 }}><Text style={local.profileTitle}>Try It Plan</Text><Text style={local.greetingSub}>One-time purchase</Text><Text style={local.greetingSub}>Explore. Learn. Build.</Text></View><View style={{ alignItems: "flex-end" }}><Text style={local.billingPrice}>{formatBillingAmount(billing.purchase.amount, billing.purchase.currencyCode)}</Text><Text style={local.activePill}>Active</Text></View></View><Notice>{billing.message} You won’t be charged again.</Notice><View style={local.includedCard}><Text style={local.setupTitle}>What’s included</Text><PreviewRow icon="▤" title="2 learning units" detail="Access two full learning units" /><PreviewRow icon="♜" title="2 practical labs" detail="Hands-on, project based labs" /><PreviewRow icon="✦" title="Up to 2 adaptive extensions" detail="Get AI-powered hints and extra practice" /></View><Text style={local.historyTitle}>Payment history</Text><View style={local.historyRow}><Text style={local.historyIcon}>▤</Text><View style={{ flex: 1 }}><Text style={local.rowTitle}>Try It Plan</Text><Text style={local.rowDetail}>{billing.purchase.purchasedAt ? new Date(billing.purchase.purchasedAt).toLocaleDateString() : "Purchase recorded"}</Text></View><Text style={local.rowTitle}>{formatBillingAmount(billing.purchase.amount, billing.purchase.currencyCode)}</Text><Text style={local.paidPill}>Paid</Text></View><Notice tone="green">♡  Thank you for being a part of AdaptiveSkills! Keep learning. A brighter tomorrow is yours.</Notice></> : <View style={local.profileCard}><Text style={local.profileTitle}>No purchases yet</Text><Text style={local.greetingSub}>{billing.message}</Text></View>}</> : null}
  </Screen>;
}

function SetupRow({ title, detail, done }: { title: string; detail: string; done: boolean }) { return <View style={local.setupRow}><View style={[local.stepCircle, done && local.stepCircleDone]}><Text style={{ color: done ? "white" : C.muted, fontWeight: "900" }}>{done ? "✓" : ""}</Text></View><View style={{ flex: 1 }}><Text style={local.rowTitle}>{title}</Text><Text style={local.rowDetail}>{detail}</Text></View></View>; }
function PreviewRow({ icon, title, detail }: { icon: string; title: string; detail: string }) { return <View style={local.previewRow}><View style={local.previewIcon}><Text style={{ color: C.blue, fontWeight: "900" }}>{icon}</Text></View><View style={{ flex: 1 }}><Text style={local.rowTitle}>{title}</Text><Text style={local.rowDetail}>{detail}</Text></View></View>; }
function formatBillingAmount(amount: number | null, currency: string | null) { if (amount === null) return "Store price"; try { return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(amount); } catch { return `${currency || ""} ${amount}`.trim(); } }

function SummaryRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return <View style={local.summaryRow}><Text style={local.summaryIcon}>{icon}</Text><Text style={local.summaryLabel}>{label}</Text><Text style={local.summaryValue} numberOfLines={1}>{value}</Text></View>;
}

function Bundle({ icon, title, detail }: { icon: string; title: string; detail: string }) {
  return <View style={local.bundle}><View style={local.bundleIcon}><Text style={{ color: C.blue, fontSize: 21 }}>{icon}</Text></View><View style={{ flex: 1 }}><Text style={local.bundleTitle}>{title}</Text><Text style={local.bundleDetail}>{detail}</Text></View><Text style={{ color: C.muted }}>›</Text></View>;
}

function formatTimeline(days: number) {
  if (days % 365 === 0) return `${days / 365} ${days === 365 ? "year" : "years"}`;
  if (days >= 60 && days % 30 === 0) return `${days / 30} months`;
  return `${days} days`;
}

function shortenGoal(goal: string) {
  const clean = goal.replace(/^I want to (become|be|learn to)\s+/i, "").trim();
  return clean.length > 34 ? `${clean.slice(0, 31).trim()}…` : clean;
}

async function recover(error: unknown, token: string, update: Common["update"], setError: (s: string) => void) {
  if (error instanceof ApiError && error.code === "STALE_VERSION") {
    try { update(await api.onboarding(token)); setError("Your latest saved progress was restored. Please check it and try again."); return; } catch { /* use original error */ }
  }
  setError(message(error));
}
function message(error: unknown) { return error instanceof Error ? error.message : "Something went wrong. Please try again."; }
function toggle(values: string[], item: string) { return values.includes(item) ? values.filter(x => x !== item) : [...values, item]; }

const local = StyleSheet.create({
  splash: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "white" }, splashLogo: { width: "58%", maxWidth: 360, aspectRatio: 1 }, splashError: { position: "absolute", left: 24, right: 24, bottom: 48, backgroundColor: "white", padding: 12, borderRadius: 16 },
  welcomeFooter: { padding: 22, borderTopWidth: 1, borderTopColor: "#E5ECF4", backgroundColor: "white", gap: 18 }, promise: { textAlign: "center", color: C.ink, fontWeight: "700" }, hero: { flex: 1, minHeight: 330, borderRadius: 24, overflow: "hidden", position: "relative", justifyContent: "flex-end" }, sun: { position: "absolute", width: 140, height: 140, borderRadius: 70, backgroundColor: "#FFF7CF", right: -28, top: -34 }, person: { position: "absolute", left: 35, bottom: 50, fontSize: 82, transform: [{ rotate: "-8deg" }] }, signs: { position: "absolute", right: 38, top: 80 }, sign: { backgroundColor: "#B9ECF4", color: C.ink, fontWeight: "800", paddingVertical: 9, paddingHorizontal: 28, marginBottom: 8, transform: [{ rotate: "-3deg" }] }, hills: { alignItems: "flex-end", opacity: .72 },
  authSwitch: { color: C.blue, textAlign: "center", fontWeight: "700", padding: 20 }, endpoint: { color: C.muted, textAlign: "center", fontSize: 11, marginTop: 20 },
  upload: { minHeight: 210, borderWidth: 1.5, borderStyle: "dashed", borderColor: "#8DB6FA", borderRadius: 15, backgroundColor: "#F8FBFF", alignItems: "center", justifyContent: "center", padding: 20 }, uploadTitle: { color: C.ink, fontWeight: "800", fontSize: 16, marginTop: 12, textAlign: "center" }, uploadHint: { color: C.muted, marginTop: 8, fontSize: 12 },
  wrap: { flexDirection: "row", flexWrap: "wrap", alignItems: "center" }, add: { borderWidth: 1, borderColor: C.blue, borderRadius: 11, padding: 12, alignItems: "center", marginBottom: 18 }, addText: { color: C.blue, fontWeight: "800" }, skillTray: { borderWidth: 1, borderColor: "#C9DAF5", borderRadius: 14, padding: 14, marginBottom: 14, backgroundColor: "#F8FBFF" }, skillReviewList: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 12 }, skillReviewChip: { minHeight: 42, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#BFD2EE", backgroundColor: "white", borderRadius: 10, paddingLeft: 12, marginRight: 8, marginBottom: 8 }, skillChipText: { color: C.ink, fontSize: 13, fontWeight: "800" }, skillRemove: { minWidth: 40, minHeight: 40, alignItems: "center", justifyContent: "center" }, skillRemoveText: { color: C.muted, fontSize: 21, lineHeight: 23, fontWeight: "600" }, levelTitle: { color: C.ink, fontWeight: "900", fontSize: 15 }, levelDetail: { color: C.muted, fontSize: 12, marginTop: 3, marginBottom: 12 }, empty: { color: "#76869C", fontSize: 12, lineHeight: 18, marginTop: 10 }, suggested: { color: C.ink, fontWeight: "800", marginVertical: 10 },
  counter: { textAlign: "right", color: C.muted, fontSize: 11, marginTop: -12, marginBottom: 15 }, grid: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginBottom: 20 }, interest: { width: "31%", minHeight: 98, borderWidth: 1, borderColor: C.line, borderRadius: 13, alignItems: "center", justifyContent: "center", padding: 8, position: "relative" }, interestOn: { borderColor: C.blue, backgroundColor: "#EFF5FF", borderWidth: 2 }, interestIcon: { fontSize: 25, color: C.ink }, interestLabel: { color: C.ink, textAlign: "center", fontSize: 11, fontWeight: "800", marginTop: 7 }, check: { position: "absolute", right: 6, top: 4, color: C.blue, fontWeight: "900" },
  customTimeline: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginTop: 8 },
  review: { borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 15, marginBottom: 10, flexDirection: "row", gap: 12 }, reviewTitle: { color: C.ink, fontWeight: "900", fontSize: 14 }, reviewValue: { color: C.muted, fontSize: 13, marginTop: 5, lineHeight: 18 }, edit: { color: C.blue, fontWeight: "800", fontSize: 12 },
  offerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  profileCard: { borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14, marginBottom: 12, backgroundColor: "#FFFFFF" }, profileHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 }, profileIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#ECF4FF", alignItems: "center", justifyContent: "center", marginRight: 10 }, profileTitle: { flex: 1, color: C.ink, fontWeight: "900", fontSize: 14 }, summaryRow: { minHeight: 30, flexDirection: "row", alignItems: "center" }, summaryIcon: { width: 28, color: C.ink, fontSize: 16 }, summaryLabel: { width: 105, color: C.muted, fontSize: 12 }, summaryValue: { flex: 1, color: C.ink, fontSize: 12, fontWeight: "600" },
  offerCard: { borderWidth: 1.5, borderColor: C.blue, borderRadius: 15, padding: 15, marginBottom: 16 }, offerHeading: { flexDirection: "row", alignItems: "center", marginBottom: 13 }, cube: { width: 48, height: 48, borderRadius: 12, backgroundColor: "#DCEBFF", alignItems: "center", justifyContent: "center", marginRight: 11 }, offerTitle: { color: C.ink, fontWeight: "900", fontSize: 17 }, bestStep: { alignSelf: "flex-start", color: C.blue, backgroundColor: "#E4EEFF", borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, fontSize: 10, fontWeight: "700", marginTop: 4 }, price: { color: C.blue, fontWeight: "900", fontSize: 23 }, oneTime: { color: C.muted, textAlign: "right", fontSize: 10 }, benefit: { flexDirection: "row", alignItems: "center", marginTop: 8 }, tick: { width: 21, height: 21, borderRadius: 11, color: C.blue, backgroundColor: "#E2EFFF", textAlign: "center", lineHeight: 21, fontWeight: "900", marginRight: 9 }, benefitText: { color: C.ink, fontSize: 12, flex: 1 },
  later: { color: C.ink, fontWeight: "900", fontSize: 13, marginBottom: 9 }, bundleRow: { flexDirection: "row", gap: 9, marginBottom: 14 }, bundle: { flex: 1, minHeight: 72, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 10, flexDirection: "row", alignItems: "center" }, bundleIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: "#EBF4FF", alignItems: "center", justifyContent: "center", marginRight: 7 }, bundleTitle: { color: C.ink, fontWeight: "800", fontSize: 11 }, bundleDetail: { color: C.muted, fontSize: 9, marginTop: 3 }, upgrade: { color: C.muted, textAlign: "center", fontSize: 10, marginTop: 10 },
  homeRoot: { flex: 1, backgroundColor: "white" }, homeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }, headerIcon: { color: C.ink, fontSize: 24, width: 32, textAlign: "center" }, notificationIcon:{fontSize:20,width:32,textAlign:"center"},notificationDot:{position:"absolute",right:2,top:0,width:7,height:7,borderRadius:4,backgroundColor:"#F43F5E"}, beforePurchase: { alignSelf: "flex-start", backgroundColor: "#E9F0FF", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }, beforePurchaseText: { color: C.blue, fontSize: 10, fontWeight: "700" }, greetingRow: { flexDirection: "row", alignItems: "center", minHeight: 95 }, greeting: { color: C.ink, fontSize: 20, fontWeight: "900" }, greetingSub: { color: C.muted, fontSize: 12, marginTop: 6 }, personAvatar: { fontSize: 62 },
  directionCard: { borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 16, marginBottom: 14, backgroundColor: "white" }, directionTitleRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 }, targetCircle: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#EAF3FF", alignItems: "center", justifyContent: "center", marginRight: 11 }, directionTitle: { color: C.ink, fontWeight: "900", fontSize: 16 }, directionSub: { color: C.muted, fontSize: 11, lineHeight: 15, marginTop: 3 },
  homePlanCard: { borderWidth: 1.2, borderColor: "#F1CE8C", borderRadius: 18, padding: 16, backgroundColor: "#FFFCF6" }, planHeading: { flexDirection: "row", alignItems: "center", marginBottom: 8 }, crown: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#FFF1C8", alignItems: "center", justifyContent: "center", marginRight: 9 }, planTitle: { flex: 1, color: C.ink, fontWeight: "900", fontSize: 17 }, planPrice: { color: C.ink, fontWeight: "900", backgroundColor: "#FFF1D0", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, fontSize: 12 }, planCopy: { color: C.muted, fontSize: 12, lineHeight: 17, marginBottom: 7 }, previewButton: { borderWidth: 1, borderColor: "#A9C9FF", borderRadius: 9, minHeight: 41, alignItems: "center", justifyContent: "center", marginTop: 8, backgroundColor: "#F7FAFF" }, previewText: { color: C.blue, fontWeight: "800", fontSize: 12 }, locked: { color: C.muted, textAlign: "center", fontSize: 10, marginTop: 13 }, signOut: { color: C.muted, textAlign: "center", fontSize: 11, paddingTop: 18 },
  paidGreeting: { flexDirection: "row", alignItems: "center", minHeight: 88 }, unlockedPill: { alignSelf: "flex-start", backgroundColor: "#E3F8ED", borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5, marginTop: 8 }, unlockedText: { color: "#16985E", fontSize: 10, fontWeight: "800" }, trialHero: { borderWidth: 1, borderColor: "#DCE8F8", borderRadius: 17, padding: 16, marginBottom: 12 }, eyebrow: { color: C.blue, fontSize: 10, letterSpacing: .4, fontWeight: "700" }, trialHeroTitle: { color: C.ink, fontSize: 20, fontWeight: "900", marginTop: 8 }, trialHeroCopy: { color: C.muted, fontSize: 12, lineHeight: 17, marginTop: 7 }, trialHeroActions: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 14 }, maybeLater: { color: C.blue, fontWeight: "800", fontSize: 11, padding: 8 }, setupCard: { borderWidth: 1, borderColor: C.line, borderRadius: 17, padding: 16, marginBottom: 12 }, setupHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }, setupTitle: { color: C.ink, fontWeight: "900", fontSize: 16 }, setupCount: { color: C.muted, fontSize: 10 }, setupRow: { flexDirection: "row", minHeight: 47 }, stepCircle: { width: 21, height: 21, borderRadius: 11, borderWidth: 1.5, borderColor: "#B7C5D9", alignItems: "center", justifyContent: "center", marginRight: 12 }, stepCircleDone: { backgroundColor: C.blue, borderColor: C.blue }, rowTitle: { color: C.ink, fontWeight: "800", fontSize: 12 }, rowDetail: { color: C.muted, fontSize: 10, lineHeight: 14, marginTop: 2 }, nextCard: { borderRadius: 17, padding: 16, marginBottom: 8 }, forYou: { color: C.blue, backgroundColor: "#E3E9FF", borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5, fontSize: 9, fontWeight: "700" }, previewRow: { flexDirection: "row", alignItems: "center", marginTop: 11 }, previewIcon: { width: 34, height: 34, borderRadius: 9, backgroundColor: "#E1EBFF", alignItems: "center", justifyContent: "center", marginRight: 10 },
  homeLoading: { minHeight: 220, alignItems: "center", justifyContent: "center", gap: 10 }, activeNextCard: { borderWidth: 1, borderColor: "#DCE8F8", borderRadius: 18, padding: 16, marginBottom: 13, backgroundColor: "#F8FBFF" }, activeTitleRow: { flexDirection: "row", alignItems: "center", marginBottom: 14 }, rocketCircle: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#E7F1FF", alignItems: "center", justifyContent: "center", marginRight: 11 }, rocket: { fontSize: 22 }, activeTitle: { color: C.ink, fontSize: 18, fontWeight: "900" }, activeCopy: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 3 }, unitChoiceGrid: { flexDirection: "row", gap: 9 }, unitChoice: { flex: 1, minHeight: 156, borderWidth: 1, borderColor: "#C9DCF8", borderRadius: 13, padding: 12, backgroundColor: "white" }, unitChoiceIcon: { color: C.blue, fontSize: 24, marginBottom: 8 }, unitChoiceTitle: { color: C.ink, fontSize: 14, fontWeight: "900" }, unitChoiceName: { color: C.muted, fontSize: 10, lineHeight: 14, marginTop: 4, minHeight: 30 }, unitChoiceButton: { minHeight: 36, borderRadius: 9, backgroundColor: "#E4EEFF", alignItems: "center", justifyContent: "center", marginTop: 10 }, unitChoiceButtonText: { color: C.blue, fontSize: 10, fontWeight: "800" }, learningStatusCard: { borderWidth: 1, borderColor: C.line, borderRadius: 17, padding: 16, marginBottom: 12 }, learningUnitRow: { flexDirection: "row", alignItems: "center", paddingVertical: 11, borderTopWidth: 1, borderTopColor: "#EDF1F6" }, learningUnitNumber: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#E8F1FF", alignItems: "center", justifyContent: "center", marginRight: 10 }, learningUnitNumberText: { color: C.blue, fontWeight: "900" }, learningMeta: { color: C.blue, fontSize: 9, fontWeight: "700", marginTop: 5 }, learningChevron: { color: C.blue, fontSize: 24, marginLeft: 6 }, whatsNextCard: { borderWidth: 1, borderColor: C.line, borderRadius: 17, padding: 16, marginBottom: 8, backgroundColor: "#FBFCFF" },
  billingTitle: { color: C.ink, fontSize: 21, fontWeight: "900", marginVertical: 20 }, billingPlan: { borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center" }, billingBag: { width: 44, height: 44, borderRadius: 12, backgroundColor: "#E7F1FF", alignItems: "center", justifyContent: "center", marginRight: 11 }, billingPrice: { color: C.ink, fontWeight: "900", fontSize: 18 }, activePill: { color: "#148353", backgroundColor: "#DCF8E9", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, fontSize: 10, marginTop: 5, fontWeight: "800" }, includedCard: { borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14, marginTop: 8 }, historyTitle: { color: C.ink, fontWeight: "900", fontSize: 15, marginTop: 18, marginBottom: 8 }, historyRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12 }, historyIcon: { color: C.blue, fontSize: 20 }, paidPill: { color: "#148353", backgroundColor: "#DCF8E9", borderRadius: 9, paddingHorizontal: 7, paddingVertical: 4, fontSize: 9, fontWeight: "800" },
  notesHeader:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:22},notesEyebrow:{color:C.blue,fontSize:10,fontWeight:"900",letterSpacing:.8},notesTitle:{color:C.ink,fontSize:29,lineHeight:35,fontWeight:"900",marginTop:6},notesIntro:{color:C.muted,fontSize:13,lineHeight:19,marginTop:5,marginBottom:20},noteFilters:{gap:8,paddingRight:12,paddingBottom:18},noteFilter:{minHeight:38,paddingHorizontal:14,borderRadius:19,borderWidth:1,borderColor:C.line,backgroundColor:"white",alignItems:"center",justifyContent:"center"},noteFilterOn:{borderColor:C.blue,backgroundColor:"#EAF2FF"},noteFilterText:{color:C.muted,fontSize:11,fontWeight:"800"},noteFilterTextOn:{color:C.blue},notesLoading:{minHeight:220,alignItems:"center",justifyContent:"center",gap:10},noteSection:{marginTop:5,marginBottom:18},noteSectionHeading:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},noteSectionTitle:{color:C.ink,fontSize:17,fontWeight:"900",marginBottom:10},noteCount:{minWidth:28,height:28,borderRadius:14,backgroundColor:"#EAF2FF",color:C.blue,textAlign:"center",lineHeight:28,fontSize:11,fontWeight:"900",marginBottom:10},noteCard:{borderWidth:1,borderColor:C.line,borderRadius:15,padding:14,backgroundColor:"white",marginBottom:10},noteMeta:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:8},noteType:{color:C.blue,backgroundColor:"#EAF2FF",borderRadius:9,paddingHorizontal:8,paddingVertical:4,fontSize:9,fontWeight:"900"},noteDate:{color:C.muted,fontSize:10},noteQuote:{color:C.muted,fontSize:12,lineHeight:18,fontStyle:"italic",borderLeftWidth:3,borderLeftColor:"#A9C9FF",paddingLeft:9,marginBottom:9},noteBody:{color:C.ink,fontSize:13,lineHeight:19},noteSource:{color:C.muted,fontSize:10,lineHeight:15,marginTop:10},noteOpen:{minHeight:42,justifyContent:"center",marginTop:4},noteOpenText:{color:C.blue,fontSize:11,fontWeight:"900"},
  drawerOverlay:{flex:1,backgroundColor:"rgba(7,21,48,.42)"},drawer:{position:"absolute",left:0,top:0,bottom:0,width:"82%",maxWidth:340,backgroundColor:"white",paddingHorizontal:20,paddingTop:12,paddingBottom:12,zIndex:2,elevation:12},drawerDismiss:{flex:1},drawerScroll:{flexGrow:1},drawerHeader:{minHeight:54,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},drawerClose:{fontSize:28,color:C.ink,fontWeight:"500",padding:8},drawerProfile:{flexDirection:"row",alignItems:"center",paddingVertical:20},drawerAvatar:{fontSize:45,marginRight:12},drawerName:{color:C.ink,fontSize:17,fontWeight:"900"},drawerRole:{color:C.muted,fontSize:11,marginTop:4},drawerDivider:{height:1,backgroundColor:"#E8EDF4",marginVertical:8},drawerItem:{minHeight:52,flexDirection:"row",alignItems:"center"},drawerItemIcon:{width:34,color:C.blue,fontSize:18,textAlign:"center",marginRight:8},drawerItemTitle:{flex:1,color:C.ink,fontSize:14,fontWeight:"800"},drawerItemDetail:{color:C.muted,fontSize:12,lineHeight:17,marginTop:5},drawerChevron:{color:C.muted,fontSize:22},drawerPanelRow:{minHeight:74,borderWidth:1,borderColor:C.line,borderRadius:12,padding:12,marginBottom:9,flexDirection:"row",alignItems:"center"},drawerPanelIcon:{width:36,height:36,borderRadius:10,backgroundColor:"#EEF5FF",color:C.blue,textAlign:"center",lineHeight:36,fontSize:18,fontWeight:"900",marginRight:10},drawerBrandMessage:{marginTop:"auto",borderRadius:13,backgroundColor:"#EEF5FF",padding:13,flexDirection:"row",alignItems:"center"},drawerBrandMark:{width:34,height:34,borderRadius:10,backgroundColor:C.blue,color:"white",textAlign:"center",lineHeight:34,fontSize:19,fontWeight:"900",marginRight:10},drawerBrandText:{flex:1,color:C.blue,fontSize:11,lineHeight:15,fontWeight:"700"},drawerTitle:{color:C.ink,fontWeight:"900",fontSize:22,marginVertical:18},drawerNote:{borderWidth:1,borderColor:C.line,borderRadius:11,padding:12,marginBottom:9},emptyNotes:{alignItems:"center",justifyContent:"center",paddingVertical:55,paddingHorizontal:16},emptyNotesIcon:{fontSize:34,color:C.blue,marginBottom:13},
});
