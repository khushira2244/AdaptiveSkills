import type { OnboardingState, Skill } from "@adaptive-labs/contracts";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "./api";
import { useAuth } from "./auth";
import { readDocument } from "./documents";

type View = "profile" | "resume" | "skills" | "goal" | "interests" | "preferences" | "review";
const views: View[] = ["profile", "resume", "skills", "goal", "interests", "preferences", "review"];
const levels = [
  ["AWARE", "Beginner / basics", "Just started or know the basics"],
  ["WORKING", "Intermediate", "Can use it and want more depth"],
  ["PRODUCTION", "Advanced / confident", "Comfortable in real projects"],
  ["DEEP", "Deep expertise", "Can diagnose and teach it"],
] as const;
const interestOptions = ["Healthcare", "Space & Aerospace", "Finance / Fintech", "Education", "Developer Tools", "Enterprise Software", "E-commerce", "Cybersecurity", "Automotive", "Robotics", "Media & Content", "Climate & Energy", "Government / Civic Tech", "Consumer Apps"];

export function OnboardingFlow() {
  const auth = useAuth();
  const navigate = useNavigate();
  if (auth.status !== "authenticated") return null;
  const token = auth.token;
  const [state, setState] = useState(auth.onboarding);
  const [view, setView] = useState<View>(() => viewFor(auth.onboarding.currentStep));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setState(auth.onboarding); setView(viewFor(auth.onboarding.currentStep)); }, [auth.onboarding]);

  async function run(action: (current: OnboardingState) => Promise<OnboardingState>, after?: (next: OnboardingState) => void | Promise<void>) {
    setBusy(true); setError("");
    try { const next = await action(state); setState(next); await after?.(next); }
    catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        try { const latest = await api.onboarding(token); setState(latest); setView(viewFor(latest.currentStep)); setError("Your latest saved progress was restored. Review it before saving again."); }
        catch { setError(message(reason)); }
      } else setError(message(reason));
    } finally { setBusy(false); }
  }
  const canonical = viewFor(state.currentStep) === view && !state.completed;
  const goNext = (next: OnboardingState) => setView(viewFor(next.currentStep));
  const common = { token, state, canonical, busy, error, setError, run, goNext };
  return <div className="flow-page">
    <FlowHeader state={state} view={view} onBack={() => { const index = views.indexOf(view); index > 0 ? setView(views[index - 1]!) : navigate("/home"); }} />
    {view === "profile" ? <ProfileStep {...common} /> : null}
    {view === "resume" ? <ResumeStep {...common} /> : null}
    {view === "skills" ? <SkillsStep {...common} /> : null}
    {view === "goal" ? <GoalStep {...common} /> : null}
    {view === "interests" ? <InterestsStep {...common} /> : null}
    {view === "preferences" ? <PreferencesStep {...common} /> : null}
    {view === "review" ? <ReviewStep {...common} edit={setView} onFinished={async () => { await auth.refresh(); navigate("/home"); }} /> : null}
  </div>;
}

type Common = { token: string; state: OnboardingState; canonical: boolean; busy: boolean; error: string; setError: (value: string) => void; run: (action: (state: OnboardingState) => Promise<OnboardingState>, after?: (next: OnboardingState) => void | Promise<void>) => Promise<void>; goNext: (next: OnboardingState) => void };

function ProfileStep({ token, state, canonical, busy, error, setError, run, goNext }: Common) {
  const [name, setName] = useState(state.profile.displayName || "");
  const [role, setRole] = useState(state.profile.currentRole || "");
  const [experience, setExperience] = useState(state.profile.experienceYears?.toString() || "");
  async function save() {
    const years = Number(experience);
    if (!name.trim() || !role.trim()) return setError("Enter your name and current role.");
    if (!Number.isFinite(years) || years < 0 || years > 80) return setError("Experience must be between 0 and 80 years.");
    await run(async current => {
      let next = await api.profile(token, current, { displayName: name.trim(), currentRole: role.trim(), experienceYears: years });
      if (canonical) while (["profile", "role", "experience"].includes(next.currentStep)) next = await api.advance(token, next);
      return next;
    }, goNext);
  }
  return <FlowCard title="Who are you right now?" detail="Your current context helps AdaptiveSkills tailor your learning path.">
    <div className="form-grid"><Field label="Your name" value={name} onChange={setName} placeholder="Enter your name" /><Field label="Current role" value={role} onChange={setRole} placeholder="e.g. Frontend Developer" /><Field label="Years of experience" type="number" min="0" max="80" value={experience} onChange={setExperience} placeholder="e.g. 2" /></div>
    <FlowActions error={error} busy={busy} primary={canonical ? "Continue" : "Save changes"} onPrimary={() => void save()} />
  </FlowCard>;
}

function ResumeStep({ token, state, canonical, busy, error, setError, run, goNext }: Common) {
  const [selected, setSelected] = useState<string[]>(state.resume?.confirmed ? [] : state.resume?.suggestions || []);
  const [progress, setProgress] = useState(0);
  const [extracting, setExtracting] = useState(false);
  const [uploading, setUploading] = useState(false);
  useEffect(() => { if (!state.resume?.confirmed) setSelected(state.resume?.suggestions || []); }, [state.resume]);
  async function upload(file?: File) {
    if (!file) return;
    setError(""); setProgress(0); setUploading(true);
    try {
      const document = await readDocument(file, setProgress); setExtracting(true);
      await run(current => api.resume(token, current, document), next => { setSelected(next.resume?.suggestions || []); });
    } catch (reason) { setError(message(reason)); }
    finally { setExtracting(false); setUploading(false); }
  }
  async function next() {
    await run(async current => {
      let updated = current;
      if (updated.resume && !updated.resume.confirmed) updated = await api.confirmResume(token, updated, updated.resume.resumeId, selected);
      if (canonical) updated = await api.advance(token, updated);
      return updated;
    }, goNext);
  }
  return <FlowCard title="Add your CV or resume" detail="This is optional. Extracted skills remain suggestions until you confirm them.">
    <label className="upload-zone"><input type="file" accept=".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={event => void upload(event.target.files?.[0])} /><span className="upload-icon">▤</span><strong>{state.resume?.filename || "Choose a resume"}</strong><small>PDF, DOCX or TXT · Maximum 2 MB</small></label>
    {(progress > 0 || extracting) && (busy || uploading) ? <div className="upload-progress"><span style={{ width: `${progress}%` }} /><small>{extracting ? "Uploading and extracting skills…" : `Reading file… ${progress}%`}</small></div> : null}
    {state.resume?.suggestions.length ? <section className="sub-card"><h3>Skills found</h3><p>Select the skills you want added to your profile.</p><div className="chip-list">{state.resume.suggestions.map(item => <button type="button" className={`chip ${selected.includes(item) ? "selected" : ""}`} key={item} onClick={() => setSelected(toggle(selected, item))}>{selected.includes(item) ? "✓ " : ""}{item}</button>)}</div></section> : null}
    <FlowActions error={error} busy={busy} secondary={canonical && !state.resume ? "Skip for now" : undefined} onSecondary={() => void next()} primary={state.resume ? "Continue" : "Choose a file above"} primaryDisabled={!state.resume} onPrimary={() => void next()} />
  </FlowCard>;
}

function SkillsStep({ token, state, canonical, busy, error, setError, run, goNext }: Common) {
  const [skills, setSkills] = useState<Skill[]>(state.skills);
  const [name, setName] = useState("");
  function add() { const clean = name.trim(); if (!clean) return; if (skills.some(item => item.name.toLowerCase() === clean.toLowerCase())) return setError("That skill is already listed."); setSkills([...skills, { name: clean, source: "MANUAL", level: null, subskills: [] }]); setName(""); }
  async function save() {
    if (skills.some(item => !item.level)) return setError("Choose a confidence level for every skill.");
    await run(async current => { let next = await api.skills(token, current, skills); if (canonical) next = await api.advance(token, next); return next; }, goNext);
  }
  return <FlowCard title="Build your skill profile" detail="Keep resume skills, add anything missing, and choose your current confidence.">
    <div className="inline-form"><Field label="Add a skill" value={name} onChange={setName} placeholder="e.g. TypeScript" onEnter={add} /><button type="button" className="secondary-button" onClick={add}>＋ Add skill</button></div>
    <div className="skill-list">{skills.map((skill, index) => <article className="skill-row" key={`${skill.name}-${index}`}><div><strong>{skill.name}</strong><span>{skill.source === "CV_CONFIRMED" ? "From confirmed resume" : "Added manually"}</span></div><select aria-label={`${skill.name} confidence`} value={skill.level || ""} onChange={event => setSkills(skills.map((item, itemIndex) => itemIndex === index ? { ...item, level: event.target.value as Skill["level"] } : item))}><option value="">Choose level</option>{levels.map(([value, title]) => <option value={value} key={value}>{title}</option>)}</select><button type="button" className="icon-button" aria-label={`Remove ${skill.name}`} onClick={() => setSkills(skills.filter((_, itemIndex) => itemIndex !== index))}>×</button></article>)}</div>
    {!skills.length ? <div className="empty-inline">Starting fresh is okay. Continue with no existing skills.</div> : null}
    <FlowActions error={error} busy={busy} primary={canonical ? "Continue" : "Save changes"} onPrimary={() => void save()} />
  </FlowCard>;
}

function GoalStep({ token, state, canonical, busy, error, setError, run, goNext }: Common) {
  const [target, setTarget] = useState(state.goal?.target || ""); const [reason, setReason] = useState(state.goal?.reason || "");
  async function save() { if (!target.trim()) return setError("Describe what you want to achieve."); await run(async current => { let next = await api.goal(token, current, target.trim(), reason.trim() || null); if (canonical) next = await api.advance(token, next); return next; }, goNext); }
  return <FlowCard title="What do you want to achieve?" detail="Describe your learning goal, role direction, or product direction in your own words."><Field label="Your goal" textarea value={target} onChange={setTarget} maxLength={3000} placeholder="I want to become…" /><div className="field-count">{target.length}/3000</div><Field label="Why does this matter to you? (optional)" textarea value={reason} onChange={setReason} placeholder="Your motivation helps personalize the path." /><FlowActions error={error} busy={busy} primary={canonical ? "Continue" : "Save changes"} onPrimary={() => void save()} /></FlowCard>;
}

function InterestsStep({ token, state, canonical, busy, error, run, goNext }: Common) {
  const [items, setItems] = useState(state.interests); const [custom, setCustom] = useState("");
  function add() { const clean = custom.trim(); if (clean && !items.some(item => item.toLowerCase() === clean.toLowerCase())) setItems([...items, clean]); setCustom(""); }
  async function save() { await run(async current => { let next = await api.interests(token, current, items); if (canonical) next = await api.advance(token, next); return next; }, goNext); }
  return <FlowCard title="What product areas interest you?" detail="Select any that apply. These stay part of your existing learner profile."><div className="interest-grid">{interestOptions.map(item => <button type="button" className={`interest-card ${items.includes(item) ? "selected" : ""}`} key={item} onClick={() => setItems(toggle(items, item))}>{items.includes(item) ? "✓ " : ""}{item}</button>)}</div><div className="inline-form"><Field label="Something else?" value={custom} onChange={setCustom} placeholder="Add your own interest" onEnter={add} /><button type="button" className="secondary-button" onClick={add}>Add</button></div><FlowActions error={error} busy={busy} secondary={!items.length ? "Skip for now" : undefined} onSecondary={() => void save()} primary={canonical ? "Continue" : "Save changes"} onPrimary={() => void save()} /></FlowCard>;
}

function PreferencesStep({ token, state, canonical, busy, error, setError, run, goNext }: Common) {
  const [days, setDays] = useState(String(state.preferences.timelineDays || 90)); const [pace, setPace] = useState(state.preferences.pace || "STEADY");
  async function save() { const timeline = Number(days); if (!Number.isInteger(timeline) || timeline < 1 || timeline > 3650) return setError("Choose a timeline between 1 and 3650 days."); await run(async current => { let next = await api.preferences(token, current, timeline, pace); if (canonical) next = await api.advance(token, next); return next; }, goNext); }
  return <FlowCard title="Choose your timeline and pace" detail="Set a realistic rhythm. Your saved choice is shared with mobile."><div className="form-grid"><Field label="Timeline in days" type="number" min="1" max="3650" value={days} onChange={setDays} /><label className="field"><span>Learning pace</span><select value={pace} onChange={event => setPace(event.target.value as typeof pace)}><option value="CASUAL">Casual</option><option value="STEADY">Steady</option><option value="INTENSIVE">Intensive</option></select></label></div><FlowActions error={error} busy={busy} primary={canonical ? "Continue" : "Save changes"} onPrimary={() => void save()} /></FlowCard>;
}

function ReviewStep({ token, state, busy, error, run, edit, onFinished }: Common & { edit: (view: View) => void; onFinished: () => Promise<void> }) {
  const rows: [string, string, View][] = [["About you", `${state.profile.displayName || "—"} · ${state.profile.currentRole || "—"} · ${state.profile.experienceYears ?? "—"} years`, "profile"], ["Resume", state.resume?.filename || "Skipped", "resume"], ["Skills", state.skills.map(item => item.name).join(", ") || "Starting fresh", "skills"], ["Goal", state.goal?.target || "—", "goal"], ["Interests", state.interests.join(", ") || "Skipped", "interests"], ["Plan", `${state.preferences.timelineDays || "—"} days · ${(state.preferences.pace || "—").toLowerCase()}`, "preferences"]];
  async function finish() { await run(current => current.completed ? Promise.resolve(current) : api.completeOnboarding(token, current), () => void onFinished()); }
  return <FlowCard title={state.completed ? "Your learner setup" : "You’re ready to begin"} detail="Review the profile that AdaptiveSkills uses across mobile and web."><div className="review-list">{rows.map(([title, value, destination]) => <article key={title}><div><span>{title}</span><strong>{value}</strong></div><button type="button" className="text-button inline" onClick={() => edit(destination)}>Edit</button></article>)}</div><FlowActions error={error} busy={busy} primary={state.completed ? "Return Home" : "Finish setup"} onPrimary={() => state.completed ? void onFinished() : void finish()} /></FlowCard>;
}

function FlowHeader({ state, view, onBack }: { state: OnboardingState; view: View; onBack: () => void }) { const position = views.indexOf(view) + 1; return <header className="flow-header"><button type="button" className="back-button" onClick={onBack}>← Back</button><div><span className="eyebrow">LEARNER SETUP</span><strong>{state.completed ? "Review profile" : `Step ${position} of ${views.length}`}</strong></div><div className="flow-progress"><span style={{ width: `${(position / views.length) * 100}%` }} /></div></header>; }
function FlowCard({ title, detail, children }: { title: string; detail: string; children: ReactNode }) { return <section className="flow-card"><h1>{title}</h1><p className="lead">{detail}</p>{children}</section>; }
function Field({ label, value, onChange, textarea = false, onEnter, ...props }: { label: string; value: string; onChange: (value: string) => void; textarea?: boolean; onEnter?: () => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) { return <label className="field"><span>{label}</span>{textarea ? <textarea value={value} onChange={event => onChange(event.target.value)} maxLength={props.maxLength} placeholder={props.placeholder} /> : <input {...props} value={value} onChange={event => onChange(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && onEnter) { event.preventDefault(); onEnter(); } }} />}</label>; }
function FlowActions({ error, busy, primary, primaryDisabled = false, onPrimary, secondary, onSecondary }: { error: string; busy: boolean; primary: string; primaryDisabled?: boolean; onPrimary: () => void; secondary?: string; onSecondary?: () => void }) { return <div className="flow-actions">{error ? <div className="notice error">{error}</div> : null}<div>{secondary ? <button className="secondary-button" type="button" disabled={busy} onClick={onSecondary}>{secondary}</button> : null}<button className="primary-button compact" type="button" disabled={busy || primaryDisabled} onClick={onPrimary}>{busy ? "Saving…" : primary}<span>→</span></button></div></div>; }
function viewFor(step: OnboardingState["currentStep"]): View {
  if (step === "profile" || step === "role" || step === "experience") return "profile";
  if (step === "complete") return "review";
  return step;
}
function toggle(values: string[], value: string) { return values.includes(value) ? values.filter(item => item !== value) : [...values, value]; }
function message(error: unknown) { return error instanceof Error ? error.message : "Something went wrong. Please try again."; }
