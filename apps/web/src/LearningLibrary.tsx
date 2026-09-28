import type { LearningNote, LearningUnit, MarkedWord } from "@adaptive-labs/contracts";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "./api";
import { useAuth } from "./auth";
import { sourceRoute } from "./learning-navigation";

export function SavedNotes() {
  return <LibraryPage<LearningNote> title="Saved Notes" detail="Notes saved from teaching and labs stay attached to their original learning context." load={api.notes} searchPlaceholder="Search notes or selected text" empty="No saved notes yet." render={note => <>
    <div className="library-meta"><span>{readable(note.sourceType)}</span><time>{formatDate(note.updatedAt)}</time></div>
    {note.selectedText ? <blockquote>{note.selectedText}</blockquote> : null}<p>{note.body}</p>
  </>} route={note => sourceRoute(note.unitId, note.conceptId)} />;
}

export function MarkedWords() {
  return <LibraryPage<MarkedWord> title="Marked Words" detail="Selections you marked while learning, with the saved explanation generated in that exact context." load={api.markedWords} searchPlaceholder="Search terms or meanings" empty="No marked words yet." render={word => <>
    <div className="library-meta"><span>{readable(word.learnerStatus)}</span><time>{formatDate(word.createdAt)}</time></div>
    <h3>{word.selectedText}</h3><p>{word.simpleMeaning}</p><details><summary>Technical meaning</summary><p>{word.technicalMeaning}</p></details>
  </>} route={word => sourceRoute(word.unitId, word.conceptId)} />;
}

function LibraryPage<T extends { noteId?: string; markedWordId?: string; unitId: string | null; conceptId: string | null }>({ title, detail, load, searchPlaceholder, empty, render, route }: { title: string; detail: string; load: (token: string, query?: string) => Promise<T[]>; searchPlaceholder: string; empty: string; render: (item: T) => ReactNode; route: (item: T) => string }) {
  const auth = useAuth();
  if (auth.status !== "authenticated") throw new Error("Library requires an authenticated session");
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<T[]>([]);
  const [units, setUnits] = useState<LearningUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async (value = query) => { setLoading(true); setError(""); try { const [saved,nextUnits]=await Promise.all([load(auth.token,value),api.learningUnits(auth.token)]);setItems(saved);setUnits(nextUnits); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load saved learning context."); } finally { setLoading(false); } }, [auth.token, load, query]);
  useEffect(() => { const timer=window.setTimeout(() => void refresh(query), 250); return () => window.clearTimeout(timer); }, [query, refresh]);
  return <section className="library-page"><header><span className="eyebrow">YOUR LEARNING CONTEXT</span><h1>{title}</h1><p>{detail}</p><label className="library-search"><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder={searchPlaceholder} /></label></header>
    {error ? <div className="learn-alert error"><span>{error}</span><button onClick={() => void refresh()}>Retry</button></div> : null}
    {loading ? <div className="library-empty"><div className="spinner" /><p>Loading saved items…</p></div> : !items.length ? <div className="library-empty"><span>✦</span><h2>{empty}</h2><p>Select text while reading to save context here.</p></div> : <div className="library-grid">{items.map((item, index) => <article key={item.noteId ?? item.markedWordId ?? index}>{render(item)}<div className="library-source">{sourceName(units,item.unitId,item.conceptId)}</div><button onClick={() => navigate(route(item))}>Open source <span>→</span></button></article>)}</div>}
  </section>;
}

function readable(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/^./, letter => letter.toUpperCase()); }
function formatDate(value: string) { const date=new Date(value); return Number.isNaN(date.valueOf()) ? "Saved" : new Intl.DateTimeFormat(undefined,{dateStyle:"medium"}).format(date); }
function sourceName(units:LearningUnit[],unitId:string|null,conceptId:string|null){const unit=units.find(value=>value.unitId===unitId);const concept=unit?.concepts.find(value=>value.conceptId===conceptId);return concept&&unit?`${unit.title} · ${concept.name}`:unit?.title??"Saved learning context";}
