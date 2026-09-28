import type { PaidSetupState } from "@adaptive-labs/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "./api";
import { useAuth } from "./auth";
import { readDocument } from "./documents";

export function PaidSetup() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<PaidSetupState | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const generating = useRef(false);
  if (auth.status !== "authenticated") return null;
  const token = auth.token;

  useEffect(() => {
    let active = true;
    setBusy(true);
    api.startPaidSetup(token).then(value => active && setState(value)).catch(reason => active && setError(message(reason))).finally(() => active && setBusy(false));
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (!state || state.status !== "TRIAL_SCOPE_CONFIRMED" || generating.current) return;
    generating.current = true; setBusy(true); setError("");
    api.generateLearningUnits(token, state).then(setState).catch(async reason => { setError(message(reason)); try { setState(await api.paidSetup(token)); } catch { /* retain useful error */ } }).finally(() => { generating.current = false; setBusy(false); });
  }, [token, state]);

  useEffect(() => {
    if (state?.status !== "TRIAL_GENERATING") return;
    const timer = window.setInterval(() => api.paidSetup(token).then(setState).catch(() => undefined), 2000);
    return () => window.clearInterval(timer);
  }, [token, state?.status]);

  async function reload(reason?: unknown) { try { const latest = await api.paidSetup(token); setState(latest); if (reason) setError("The latest saved setup was restored. Review it before trying again."); } catch { if (reason) setError(message(reason)); } }
  async function act(action: (current: PaidSetupState) => Promise<PaidSetupState>) {
    if (!state) return false;
    setBusy(true); setError("");
    try { setState(await action(state)); return true; }
    catch (reason) { if (reason instanceof ApiError && reason.status === 409) await reload(reason); else setError(message(reason)); return false; }
    finally { setBusy(false); }
  }

  if (busy && !state) return <SetupState title="Opening your learning setup" detail="Loading your existing target and entitlement-backed setup…" busy />;
  if (!state) return <SetupState title="Setup isn’t available" detail={error || "AdaptiveSkills could not load your paid setup."} action="Return Home" onAction={() => navigate("/home")} />;
  if (state.status === "TRIAL_PAID_SETUP_PENDING") return <TargetContext state={state} token={token} busy={busy} error={error} setError={setError} onAnalyze={async context => { await act(async current => api.proposeLearningScope(token, await api.savePaidContext(token, current, context))); }} onHome={() => navigate("/home")} />;
  if (state.status === "TRIAL_SCOPE_PROPOSED") return <ScopeEditor state={state} busy={busy} error={error} setError={setError} onSave={items => act(current => api.saveLearningScope(token, current, items))} onConfirm={() => act(current => api.confirmLearningScope(token, current))} onHome={() => navigate("/home")} />;
  if (state.status === "TRIAL_GENERATION_FAILED") return <SetupState title="We couldn’t generate your units" detail={error || "Your confirmed scope is safe. Retry generation without losing your selections."} action={busy ? "Retrying…" : "Retry generation"} onAction={() => void act(current => api.generateLearningUnits(token, current))} secondary="Return Home" onSecondary={() => navigate("/home")} />;
  if (state.status === "TRIAL_READY") return <Ready state={state} onHome={async () => { await auth.refresh(); navigate("/home"); }} onLearn={async () => { await auth.refresh(); navigate("/learn"); }} />;
  return <SetupState title="Generating your first two units" detail="Your confirmed scope is saved. AdaptiveSkills is organizing it into a coherent learning sequence." busy secondary="Return Home" onSecondary={() => navigate("/home")} />;
}

type Context = PaidSetupState["context"];
function TargetContext({ state, token, busy, error, setError, onAnalyze, onHome }: { state: PaidSetupState; token: string; busy: boolean; error: string; setError: (value: string) => void; onAnalyze: (context: { jdText: string | null; targetCompany: string | null; productStyle: string | null; targetDepth: Context["targetDepth"] }) => Promise<void>; onHome: () => void }) {
  const [jd, setJd] = useState(state.context.jdText || ""); const [filename, setFilename] = useState("");
  const [company, setCompany] = useState(state.context.targetCompany || ""); const [product, setProduct] = useState(state.context.productStyle || "");
  const [depth, setDepth] = useState<Context["targetDepth"]>(state.context.targetDepth);
  const [fileBusy, setFileBusy] = useState(false); const [progress, setProgress] = useState(0);
  async function upload(file?: File) { if (!file) return; setFileBusy(true); setError(""); setProgress(0); try { const document = await readDocument(file, setProgress); const parsed = await api.readJdDocument(token, document); setJd(parsed.text); setFilename(parsed.filename); } catch (reason) { setError(message(reason)); } finally { setFileBusy(false); } }
  return <div className="setup-layout"><section className="flow-card setup-main"><button className="back-button" type="button" onClick={onHome}>← Home</button><span className="eyebrow">TARGET CONTEXT</span><h1>Shape your personalized learning trial</h1><p className="lead">Your goal and profile are already saved. Add optional context and choose how deep the complete path should go.</p>
    <section className="sub-card"><h3>Target depth</h3><p>Choose an existing supported depth.</p><div className="segmented">{(["BASIC", "STANDARD", "DEEP"] as const).map(value => <button type="button" className={depth === value ? "selected" : ""} key={value} onClick={() => setDepth(value)}>{title(value)}</button>)}</div></section>
    <label className="field"><span>Job description or role brief</span><textarea value={jd} onChange={event => setJd(event.target.value)} placeholder="Paste a job description here…" /></label>
    <label className="document-button">Upload PDF, DOCX or TXT<input type="file" accept=".pdf,.docx,.txt" onChange={event => void upload(event.target.files?.[0])} /></label>{fileBusy ? <div className="upload-progress"><span style={{ width: `${progress}%` }} /><small>{progress < 100 ? `Reading file… ${progress}%` : "Extracting job description…"}</small></div> : null}{filename ? <p className="file-note">Text loaded from {filename}. You can edit it above.</p> : null}
    <div className="form-grid"><Field label="Target company (optional)" value={company} onChange={setCompany} placeholder="Company name" /><Field label="Product style (optional)" value={product} onChange={setProduct} placeholder="e.g. Fintech, B2B SaaS" /></div>
    {error ? <div className="notice error">{error}</div> : null}<div className="flow-actions"><div><button className="secondary-button" type="button" disabled={busy || fileBusy} onClick={() => void onAnalyze({ jdText: null, targetCompany: null, productStyle: null, targetDepth: depth })}>Skip optional context</button><button className="primary-button compact" type="button" disabled={busy || fileBusy} onClick={() => void onAnalyze({ jdText: jd.trim() || null, targetCompany: company.trim() || null, productStyle: product.trim() || null, targetDepth: depth })}>{busy ? "Analyzing your target…" : "Analyze target"}<span>→</span></button></div></div>
  </section><TargetPanel state={state} /></div>;
}

function ScopeEditor({ state, busy, error, setError, onSave, onConfirm, onHome }: { state: PaidSetupState; busy: boolean; error: string; setError: (value: string) => void; onSave: (items: { conceptId: string; selected: boolean }[]) => Promise<boolean>; onConfirm: () => Promise<boolean>; onHome: () => void }) {
  const [active, setActive] = useState(state.learningMap[0]?.capabilityId || "");
  const [selected, setSelected] = useState(() => new Set(state.learningMap.flatMap(group => group.concepts).filter(concept => concept.selected).map(concept => concept.conceptId)));
  const [reviewing, setReviewing] = useState(false);
  useEffect(() => { setSelected(new Set(state.learningMap.flatMap(group => group.concepts).filter(concept => concept.selected).map(concept => concept.conceptId))); }, [state.revision, state.learningMap]);
  const capability = state.learningMap.find(group => group.capabilityId === active) || state.learningMap[0];
  const concepts = state.learningMap.flatMap(group => group.concepts); const selectedCount = concepts.filter(concept => selected.has(concept.conceptId)).length;
  async function save() { const changes = concepts.filter(concept => concept.status !== "KNOWN" && concept.selected !== selected.has(concept.conceptId)).map(concept => ({ conceptId: concept.conceptId, selected: selected.has(concept.conceptId) })); if (selectedCount < 2) return setError("Select at least two concepts."); if (changes.length && !(await onSave(changes))) return; setReviewing(true); }
  return <div className="scope-page"><header className="scope-heading"><button className="back-button" type="button" onClick={onHome}>← Home</button><div><span className="eyebrow">LEARNING SCOPE</span><h1>{reviewing ? "Confirm your learning scope" : "Review your proposed learning map"}</h1><p>The recommendation and rationale come directly from AdaptiveSkills analysis.</p></div></header>
    <div className="scope-layout"><aside className="capability-nav"><h2>Capability groups</h2>{state.learningMap.map(group => <button type="button" className={group.capabilityId === capability?.capabilityId ? "active" : ""} key={group.capabilityId} onClick={() => { setActive(group.capabilityId); setReviewing(false); }}><strong>{group.tab}</strong><span>{group.concepts.filter(item => selected.has(item.conceptId)).length} selected</span></button>)}</aside>
      <section className="concept-column">{reviewing ? <ScopeReview state={state} selected={selected} /> : capability ? <><div className="capability-intro"><span className="status-badge">{capability.tab}</span><h2>{capability.name}</h2><p>{capability.reason}</p><div className="scenario"><strong>Where this applies</strong>{capability.scenario}</div></div>{capability.concepts.map(concept => { const locked = concept.status === "KNOWN"; const checked = selected.has(concept.conceptId); return <label className={`concept-card ${checked ? "selected" : ""} ${locked ? "locked" : ""}`} key={concept.conceptId}><input type="checkbox" checked={checked} disabled={locked} onChange={() => { const next = new Set(selected); next.has(concept.conceptId) ? next.delete(concept.conceptId) : next.add(concept.conceptId); setSelected(next); }} /><div><div className="concept-title"><strong>{concept.name}</strong><span className={`concept-status ${concept.status.toLowerCase()}`}>{concept.status === "DEEP" ? "Deeper" : title(concept.status)}</span></div><p>{concept.recommendationReason}</p><small>{title(concept.requirementClass)} · {title(concept.depthCategory)}</small>{concept.prerequisites?.length ? <div className="dependency-list"><strong>Depends on</strong>{concept.prerequisites.map(item => <span key={item.conceptId}>{item.name}</span>)}</div> : null}<div className="short-example">{concept.shortExample}</div></div></label>; })}</> : <div className="empty-inline">The backend returned an empty scope. Retry analysis from Home.</div>}
        {error ? <div className="notice error">{error}</div> : null}<div className="scope-actions">{reviewing ? <button className="secondary-button" type="button" onClick={() => setReviewing(false)}>Back to edit</button> : null}<button className="primary-button compact" type="button" disabled={busy || !state.learningMap.length} onClick={() => reviewing ? void onConfirm() : void save()}>{busy ? "Saving…" : reviewing ? "Confirm learning scope" : "Review selection"}<span>→</span></button></div>
      </section><ScopeContext state={state} count={selectedCount} /></div>
  </div>;
}

function ScopeReview({ state, selected }: { state: PaidSetupState; selected: Set<string> }) { const chosen = state.learningMap.flatMap(group => group.concepts.map(concept => ({ group: group.name, concept }))).filter(item => selected.has(item.concept.conceptId)); return <><div className="capability-intro"><span className="status-badge">FINAL REVIEW</span><h2>{chosen.length} concepts selected</h2><p>Dependencies will be validated by the backend when you confirm.</p></div><div className="review-concepts">{chosen.map(({ group, concept }) => <article key={concept.conceptId}><div><strong>{concept.name}</strong><span>{group}</span></div><small>{title(concept.status)} · {title(concept.depthCategory)}</small></article>)}</div></>; }
function ScopeContext({ state, count }: { state: PaidSetupState; count: number }) { return <aside className="scope-context"><span className="eyebrow">SCOPE SUMMARY</span><h2>{count} selected</h2><dl><dt>Depth</dt><dd>{title(state.context.targetDepth)}</dd><dt>Target path</dt><dd>{state.context.targetPath ? title(state.context.targetPath) : "Derived during analysis"}</dd><dt>Company</dt><dd>{state.context.targetCompany || "Not specified"}</dd><dt>Product context</dt><dd>{state.context.productStyle || "Not specified"}</dd></dl><h3>Target requirements</h3>{state.requirements.map(requirement => <article className="requirement" key={`${requirement.name}-${requirement.source}`}><strong>{requirement.name}</strong><span>{title(requirement.classification)} · {title(requirement.source)}</span><p>{requirement.reason}</p></article>)}</aside>; }
function TargetPanel({ state }: { state: PaidSetupState }) { return <aside className="setup-context"><span className="eyebrow">SAVED LEARNER CONTEXT</span><h2>{state.context.goal}</h2><dl><dt>Current role</dt><dd>{state.context.role || "Not set"}</dd><dt>Skills</dt><dd>{state.context.skills.map(skill => skill.name).join(", ") || "Starting fresh"}</dd><dt>Interests</dt><dd>{state.context.interests.join(", ") || "Not specified"}</dd><dt>Timeline</dt><dd>{state.context.timelineDays ? `${state.context.timelineDays} days` : "Not set"}</dd></dl></aside>; }
function Ready({ state, onHome, onLearn }: { state: PaidSetupState; onHome: () => Promise<void>; onLearn: () => Promise<void> }) { return <section className="flow-card ready-card"><div className="success-mark">✓</div><span className="eyebrow">LEARNING READY</span><h1>Your first two units are ready</h1><p className="lead">The same generated units are now available on mobile and web.</p><div className="unit-preview-grid">{state.units.map(unit => <article key={unit.unitId}><span>Unit {unit.sequence}</span><h2>{unit.title}</h2><p>{unit.goal}</p><small>{unit.concepts.length} concepts</small></article>)}</div><div className="ready-actions"><button className="secondary-button" onClick={() => void onHome()}>Return Home</button><button className="primary-button compact" onClick={() => void onLearn()}>Continue to learning <span>→</span></button></div></section>; }
function SetupState({ title: heading, detail, busy = false, action, onAction, secondary, onSecondary }: { title: string; detail: string; busy?: boolean; action?: string; onAction?: () => void; secondary?: string; onSecondary?: () => void }) { return <section className="flow-card setup-state">{busy ? <div className="spinner" /> : <div className="state-icon">!</div>}<h1>{heading}</h1><p className="lead">{detail}</p><div className="ready-actions">{secondary ? <button className="secondary-button" onClick={onSecondary}>{secondary}</button> : null}{action ? <button className="primary-button compact" disabled={busy} onClick={onAction}>{action}<span>→</span></button> : null}</div></section>; }
function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) { return <label className="field"><span>{label}</span><input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} /></label>; }
function title(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, character => character.toUpperCase()); }
function message(error: unknown) { return error instanceof Error ? error.message : "Something went wrong. Please try again."; }
