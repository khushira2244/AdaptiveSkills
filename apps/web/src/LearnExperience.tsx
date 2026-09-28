import type { ConceptLesson, ContinuationState, LearningDoubt, LearningNote, LearningSourceType, LearningUnit, MarkedWord, UnitTeaching } from "@adaptive-labs/contracts";
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, type LearningReference } from "./api";
import { useAuth } from "./auth";
import { isUnitOpen, markerForAction, pickLessonIndex, pickUnit, restoredSections, sectionIds, selectionContext } from "./learning-navigation";

type Selection = { selectedText: string; sourceContext: string; blockId: string; sourceType: LearningSourceType; x: number; y: number };

export function LearnExperience() {
  const auth = useAuth();
  if (auth.status !== "authenticated") throw new Error("Learn requires an authenticated session");
  const { token } = auth;
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const [units, setUnits] = useState<LearningUnit[]>([]);
  const [continuation, setContinuation] = useState<ContinuationState | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [teaching, setTeaching] = useState<UnitTeaching | null>(null);
  const [lessonIndex, setLessonIndex] = useState(0);
  const [notes, setNotes] = useState<LearningNote[]>([]);
  const [words, setWords] = useState<MarkedWord[]>([]);
  const [doubts, setDoubts] = useState<LearningDoubt[]>([]);
  const [loading, setLoading] = useState(true);
  const [teachingBusy, setTeachingBusy] = useState(false);
  const [teachingAttempt, setTeachingAttempt] = useState(0);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const requestedUnit = search.get("unit");
  const requestedConcept = search.get("concept");

  const reloadContext = useCallback(async () => {
    const [savedNotes, savedWords, savedDoubts] = await Promise.all([api.notes(token), api.markedWords(token), api.learningDoubts(token)]);
    setNotes(savedNotes); setWords(savedWords); setDoubts(savedDoubts);
  }, [token]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [nextUnits, nextContinuation] = await Promise.all([api.learningUnits(token), api.continuation(token)]);
      const picked = pickUnit(nextUnits, requestedUnit, nextContinuation.nextUnitId);
      setUnits(nextUnits); setContinuation(nextContinuation); setSelectedUnitId(picked?.unitId ?? null);
      await reloadContext();
    } catch (reason) { setError(message(reason)); }
    finally { setLoading(false); }
  }, [reloadContext, requestedUnit, token]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selectedUnitId) { setTeaching(null); return; }
    const unit = units.find(value => value.unitId === selectedUnitId);
    if (!unit || !isUnitOpen(unit)) return;
    let live = true;
    setTeachingBusy(true); setError("");
    void api.openUnitTeaching(token, selectedUnitId).then(value => {
      if (!live) return;
      setTeaching(value); setLessonIndex(pickLessonIndex(value.lessons, null));
    }).catch(reason => { if (live) setError(message(reason)); }).finally(() => { if (live) setTeachingBusy(false); });
    return () => { live = false; };
  }, [selectedUnitId, teachingAttempt, token, units]);

  useEffect(() => {
    if (teaching && requestedConcept) setLessonIndex(pickLessonIndex(teaching.lessons, requestedConcept));
  }, [requestedConcept, teaching]);

  const selectedUnit = units.find(unit => unit.unitId === selectedUnitId) ?? null;
  const lesson = teaching?.lessons[lessonIndex] ?? null;
  const relevantNotes = notes.filter(note => note.unitId === selectedUnitId && (!lesson || note.conceptId === lesson.conceptId));
  const relevantWords = words.filter(word => word.unitId === selectedUnitId && (!lesson || word.conceptId === lesson.conceptId));
  const relevantDoubts = doubts.filter(doubt => doubt.unitId === selectedUnitId && (!lesson || !doubt.conceptName || doubt.conceptName === lesson.conceptName));

  function chooseUnit(unit: LearningUnit) {
    if (!isUnitOpen(unit)) return;
    setSelectedUnitId(unit.unitId); setTeaching(null); setSelection(null); setFeedback("");
    navigate(`/learn?unit=${unit.unitId}`, { replace: true });
  }

  function chooseLesson(index: number) {
    if (!teaching) return;
    setLessonIndex(index); setSelection(null); setFeedback("");
    navigate(`/learn?unit=${teaching.unitId}&concept=${teaching.lessons[index]!.conceptId}`, { replace: true });
  }

  async function saveMarker(kind: keyof typeof markerForAction) {
    if (!selection || !lesson || !selectedUnit) return;
    setActionBusy(true); setFeedback("");
    try {
      await api.addMarker(token, { ...reference(selectedUnit, lesson, selection), markerType: markerForAction[kind] });
      setFeedback(kind === "know" ? "Marked as understood." : kind === "doubt" ? "Added to doubt clearance." : "Saved for deeper learning.");
      setSelection(null); await reloadContext();
    } catch (reason) { setFeedback(message(reason)); }
    finally { setActionBusy(false); }
  }

  async function markSelection() {
    if (!selection || !lesson || !selectedUnit) return;
    setActionBusy(true); setFeedback("");
    try {
      const base = reference(selectedUnit, lesson, selection);
      await api.addMarkedWord(token, { ...base, sourceContext: selection.sourceContext, learnerStatus: "GO_DEEPER" });
      setFeedback("Selection saved to Marked Words."); setSelection(null); await reloadContext();
    } catch (reason) { setFeedback(message(reason)); }
    finally { setActionBusy(false); }
  }

  async function saveNote() {
    if (!selection || !lesson || !selectedUnit || !noteDraft.trim()) return;
    setActionBusy(true); setFeedback("");
    try {
      const base = reference(selectedUnit, lesson, selection);
      await api.addNote(token, { ...base, fileId: null, attachmentType: "SELECTED_TEXT", attachmentRef: base.sourceId, body: noteDraft.trim() });
      setFeedback("Note saved."); setNoteDraft(""); setSelection(null); await reloadContext();
    } catch (reason) { setFeedback(message(reason)); }
    finally { setActionBusy(false); }
  }

  if (loading) return <LearnState title="Loading your learning path" detail="Restoring units, lesson progress, notes, and doubts…" busy />;
  if (error && !units.length) return <LearnState title="We couldn’t load Learn" detail={error} action="Try again" onAction={() => void load()} />;
  if (!units.length) return <LearnState title="No learning units yet" detail="Complete your learning scope to prepare the first unit." action="Open setup" onAction={() => navigate("/setup")} />;

  return <div className="learn-page">
    <aside className="learn-outline" aria-label="Learning path">
      <div className="learn-outline-heading"><span className="eyebrow">CURRENT RUNWAY</span><h2>Learn</h2><p>{continuation ? `${continuation.plannedUnits} units · ${continuation.plannedLabs} labs` : "Your saved path"}</p></div>
      <div className="unit-tree">{units.map(unit => <div className={`unit-node ${unit.unitId === selectedUnitId ? "active" : ""}`} key={unit.unitId}>
        <button disabled={!isUnitOpen(unit)} onClick={() => chooseUnit(unit)}><span className="unit-number">{unit.status === "COMPLETE" ? "✓" : unit.status === "LOCKED" ? "🔒" : unit.sequence}</span><span><strong>{unit.title}</strong><small>{statusLabel(unit.status)}</small></span></button>
        {unit.unitId === selectedUnitId && teaching ? <div className="concept-tree">{teaching.lessons.map((value, index) => <button className={index === lessonIndex ? "active" : ""} key={value.lessonId} onClick={() => chooseLesson(index)}><span>{value.completed ? "✓" : index + 1}</span>{value.conceptName}</button>)}</div> : null}
      </div>)}</div>
    </aside>

    <main className="teaching-column">
      {error ? <div className="learn-alert error"><span>{error}</span><button onClick={() => { setTeachingAttempt(value => value + 1); void load(); }}>Retry</button></div> : null}
      {feedback ? <div className="learn-alert">{feedback}</div> : null}
      {continuation?.nextAction === "DOUBT_CLEARANCE" ? <div className="boundary-callout"><div><span className="eyebrow">DOUBT CLEARANCE</span><h2>Review focused clarifications</h2><p>Resolve the planned theory doubts in the context panel. Practical weaknesses remain attached to future lab evidence.</p></div><strong>{continuation.openDoubts} open</strong></div> : null}
      {continuation?.nextLabId && (continuation.nextAction === "START_LAB" || continuation.nextAction === "RESUME_LAB") ? <div className="boundary-callout"><div><span className="eyebrow">LAB BOUNDARY</span><h2>{continuation.nextAction === "RESUME_LAB" ? "Your practical lab is in progress" : "Your practical lab is ready"}</h2><p>Teaching remains available for review. Continue to the saved lab when you are ready.</p></div><button className="primary-button compact" onClick={() => navigate(`/work?lab=${continuation.nextLabId}`)}>{continuation.nextAction === "RESUME_LAB" ? "Resume lab" : "Go to Lab"}<span>→</span></button></div> : null}
      {teachingBusy ? <LearnState title="Preparing this unit" detail="Opening the saved teaching content. It will be reused when you return." busy /> : null}
      {!teachingBusy && teaching && lesson && selectedUnit ? <TeachingReader key={lesson.lessonId} unit={selectedUnit} teaching={teaching} lesson={lesson} lessonIndex={lessonIndex} token={token} onBack={() => navigate(-1)} onSelection={setSelection} onContinue={async updated => {
        const copy = { ...teaching, lessons: teaching.lessons.map(item => item.lessonId === updated.lessonId ? updated : item) };
        setTeaching(copy);
        if (lessonIndex < copy.lessons.length - 1) chooseLesson(lessonIndex + 1);
        else {
          setTeachingBusy(true);
          try { const result = await api.completeLearningUnit(token, selectedUnit.unitId); navigate(`/work?lab=${result.labId}`); }
          catch (reason) { setError(message(reason)); }
          finally { setTeachingBusy(false); }
        }
      }} /> : null}
      {!teachingBusy && !teaching ? <LearnState title="Choose a unit" detail="Open an available unit from your current runway. Locked units become available through backend progression." /> : null}
    </main>

    <aside className="learning-context">
      <section><span className="eyebrow">LESSON STATUS</span><h3>{lesson?.conceptName ?? selectedUnit?.title ?? "Learning path"}</h3><p>{lesson ? `${lesson.completed ? "Complete" : "In progress"} · ${lesson.lastBlockPosition}/${lesson.blocks.length + 1} sections reached` : "Choose a concept to view its saved context."}</p></section>
      <ContextSection title="Notes" count={relevantNotes.length} empty="No saved notes for this concept.">{relevantNotes.slice(0, 3).map(note => <article key={note.noteId}><q>{note.selectedText}</q><p>{note.body}</p></article>)}</ContextSection>
      <ContextSection title="Marked words" count={relevantWords.length} empty="No marked words for this concept.">{relevantWords.slice(0, 3).map(word => <article key={word.markedWordId}><strong>{word.selectedText}</strong><p>{word.simpleMeaning}</p></article>)}</ContextSection>
      <ContextSection title="Doubts & deeper learning" count={relevantDoubts.length} empty="No open doubts for this concept.">{relevantDoubts.map(doubt => <DoubtCard key={doubt.doubtId} doubt={doubt} busy={actionBusy} onResolve={async () => { setActionBusy(true); try { await api.resolveDoubt(token, doubt.doubtId); await reloadContext(); } catch (reason) { setFeedback(message(reason)); } finally { setActionBusy(false); } }} />)}</ContextSection>
    </aside>

    {selection ? <div className="selection-tools" style={{ left: selection.x, top: selection.y }} role="toolbar" aria-label="Selected text actions">
      <button onClick={() => setNoteDraft(value => value || " ")}>Add note</button><button onClick={() => void markSelection()}>Mark selection</button><button onClick={() => void saveMarker("know")}>I know</button><button onClick={() => void saveMarker("doubt")}>I don’t understand</button><button onClick={() => void saveMarker("deeper")}>Go deeper</button>
    </div> : null}
    {selection && noteDraft ? <div className="modal-backdrop" onMouseDown={() => setNoteDraft("")}><form className="note-modal" role="dialog" aria-modal="true" aria-labelledby="note-dialog-title" onMouseDown={event => event.stopPropagation()} onSubmit={event => { event.preventDefault(); void saveNote(); }}><span className="eyebrow">ADD NOTE</span><h2 id="note-dialog-title">Save this learning context</h2><blockquote>{selection.selectedText}</blockquote><label>Your note<textarea autoFocus value={noteDraft.trimStart()} onChange={event => setNoteDraft(event.target.value)} /></label><div><button type="button" className="secondary-button" onClick={() => setNoteDraft("")}>Cancel</button><button type="submit" className="primary-button compact" disabled={!noteDraft.trim() || actionBusy}>Save note</button></div></form></div> : null}
  </div>;
}

function TeachingReader({ unit, teaching, lesson, lessonIndex, token, onBack, onSelection, onContinue }: { unit: LearningUnit; teaching: UnitTeaching; lesson: ConceptLesson; lessonIndex: number; token: string; onBack: () => void; onSelection: (value: Selection | null) => void; onContinue: (lesson: ConceptLesson) => Promise<void> }) {
  const [reached, setReached] = useState(() => new Set(restoredSections(lesson)));
  const [open, setOpen] = useState(() => restoredSections(lesson).at(-1) ?? lesson.blocks[0]?.blockId ?? `recap:${lesson.lessonId}`);
  const [busy, setBusy] = useState(false);
  const reader = useRef<HTMLElement>(null);
  const ids = sectionIds(lesson);
  const complete = ids.every(id => reached.has(id));

  async function openSection(id: string, position: number) {
    setOpen(id);
    if (reached.has(id)) return;
    setReached(previous => new Set(previous).add(id));
    await api.saveLessonProgress(token, lesson.lessonId, position, false).catch(() => undefined);
  }

  function captureSelection(event: MouseEvent) {
    const browserSelection = window.getSelection();
    if (!browserSelection || browserSelection.isCollapsed || !browserSelection.rangeCount) return onSelection(null);
    const element = (event.target as HTMLElement).closest<HTMLElement>("[data-selectable]");
    if (!element || !reader.current?.contains(element)) return onSelection(null);
    const range = browserSelection.getRangeAt(0);
    if (!element.contains(range.commonAncestorContainer)) return onSelection(null);
    const context = selectionContext(browserSelection.toString(), element.textContent ?? "");
    if (!context.selectedText) return onSelection(null);
    const rect = range.getBoundingClientRect();
    onSelection({ ...context, blockId: element.dataset.blockId!, sourceType: element.dataset.sourceType as LearningSourceType, x: Math.max(10, Math.min(window.innerWidth - 570, rect.left)), y: Math.max(10, rect.top - 52) });
  }

  async function continueLesson() {
    if (!complete || busy) return;
    setBusy(true);
    try { await api.saveLessonProgress(token, lesson.lessonId, ids.length, true); await onContinue({ ...lesson, completed: true, lastBlockPosition: ids.length }); }
    finally { setBusy(false); }
  }

  return <article className="teaching-reader" ref={reader} onMouseUp={captureSelection}>
    <button className="reader-back" onClick={onBack}>← Back</button>
    <header><span className="eyebrow">CONCEPT {lessonIndex + 1} OF {teaching.lessons.length}</span><h1>{lesson.title}</h1><p className="reader-objective">{lesson.objective}</p><div className="unit-intro"><strong>About this unit</strong><p>{teaching.introduction}</p></div></header>
    <div className="lesson-progress"><span style={{ width: `${Math.round((reached.size / ids.length) * 100)}%` }} /></div>
    <div className="lesson-sections">{lesson.blocks.map((block, index) => <section className={`teaching-section ${open === block.blockId ? "open" : ""}`} key={block.blockId}>
      <button className="section-trigger" onClick={() => void openSection(block.blockId, index + 1)}><span><small>{sectionKind(block.type)}</small>{block.title}</span><b>{open === block.blockId ? "−" : "+"}</b></button>
      {open === block.blockId ? <div className="section-content" data-selectable data-block-id={block.blockId} data-source-type={block.type === "CODE" ? "CODE_SELECTION" : "CONCEPT_SECTION"}>
        {block.body ? <p>{block.body}</p> : null}
        {block.items.length ? <ul>{block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul> : null}
        {block.code ? <CodeBlock language={block.language} code={block.code} /> : null}
      </div> : null}
    </section>)}
    <section className={`teaching-section ${open === `recap:${lesson.lessonId}` ? "open" : ""}`}><button className="section-trigger" onClick={() => void openSection(`recap:${lesson.lessonId}`, ids.length)}><span><small>RECAP</small>Quick recap</span><b>{open === `recap:${lesson.lessonId}` ? "−" : "+"}</b></button>{open === `recap:${lesson.lessonId}` ? <div className="section-content" data-selectable data-block-id={`recap:${lesson.lessonId}`} data-source-type="CONCEPT_SECTION"><ul>{lesson.recap.map((item, index) => <li key={index}>{item}</li>)}</ul></div> : null}</section>
    </div>
    <footer><p>{complete ? "All required sections are open." : `Open ${ids.length - reached.size} more required ${ids.length - reached.size === 1 ? "section" : "sections"} to continue.`}</p><button className="primary-button" disabled={!complete || busy} onClick={() => void continueLesson()}>{lessonIndex === teaching.lessons.length - 1 ? "Complete unit and open lab" : "Complete and next concept"}<span>→</span></button></footer>
  </article>;
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return <div className="code-block"><div><span>{language || "code"}</span><button onClick={async () => { await navigator.clipboard.writeText(code); setCopied(true); window.setTimeout(() => setCopied(false), 1300); }}>{copied ? "Copied" : "Copy"}</button></div><pre><code>{code}</code></pre></div>;
}

function ContextSection({ title, count, empty, children }: { title: string; count: number; empty: string; children: ReactNode }) {
  return <section><div className="context-title"><h3>{title}</h3><span>{count}</span></div>{count ? <div className="context-items">{children}</div> : <p>{empty}</p>}</section>;
}

function DoubtCard({ doubt, busy, onResolve }: { doubt: LearningDoubt; busy: boolean; onResolve: () => Promise<void> }) {
  const explanation = typeof doubt.context?.explanation === "string" ? doubt.context.explanation : null;
  const recap = Array.isArray(doubt.context?.recap) ? doubt.context.recap.filter((item): item is string => typeof item === "string") : [];
  return <article className="doubt-card"><strong>{doubt.sourceText || doubt.conceptName || "Saved doubt"}</strong><small>{doubt.resolutionType?.replaceAll("_", " ").toLowerCase() || doubt.status.toLowerCase()}</small>{explanation ? <p>{explanation}</p> : doubt.resolutionType === "MERGE_INTO_NEXT_UNIT" ? <p>This context is attached to a future unit.</p> : <p>Focused clarification will appear at the planned checkpoint.</p>}{recap.length ? <ul>{recap.map((item, index) => <li key={index}>{item}</li>)}</ul> : null}{doubt.status !== "DEFERRED" ? <button disabled={busy} onClick={() => void onResolve()}>Mark resolved</button> : null}</article>;
}

function LearnState({ title, detail, busy, action, onAction }: { title: string; detail: string; busy?: boolean; action?: string; onAction?: () => void }) {
  return <section className="learn-state">{busy ? <div className="spinner" /> : <div className="state-icon">!</div>}<h2>{title}</h2><p>{detail}</p>{action ? <button className="primary-button compact" onClick={onAction}>{action}</button> : null}</section>;
}

function reference(unit: LearningUnit, lesson: ConceptLesson, selection: Selection): LearningReference {
  return { sourceType: selection.sourceType, sourceId: `${lesson.lessonId}:${selection.blockId}`, unitId: unit.unitId, conceptId: lesson.conceptId, labId: null, selectedText: selection.selectedText };
}

function sectionKind(type: string) { return type.replaceAll("_", " "); }
function statusLabel(status: LearningUnit["status"]) { return status === "DOUBT_CHECKPOINT" ? "Doubt clearance" : status.replaceAll("_", " ").toLowerCase(); }
function message(reason: unknown) { return reason instanceof Error ? reason.message : "Something went wrong. Try again."; }
