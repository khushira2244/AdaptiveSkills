import type { LabEvidenceResult, LabFile, LabRunResult, LabState, LabSubmitResult } from "@adaptive-labs/contracts";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "./api";
import { useAuth } from "./auth";
import { canEditFile, canUseHint, evidenceBuckets, hintNumber, nextActionLabel, nextActionRoute, resolveLabEntry, roleLabel, saveStateLabel, type SaveState } from "./lab-workspace-model";

export function LabBoundary(){
  const auth=useAuth();
  if(auth.status!=="authenticated")throw new Error("My Work requires an authenticated session");
  const [search]=useSearchParams(); const navigate=useNavigate(); const requestedLab=search.get("lab");
  const [labId,setLabId]=useState<string|null>(requestedLab); const [lab,setLab]=useState<LabState|null>(null);
  const [drafts,setDrafts]=useState<Record<string,string>>({}); const [versions,setVersions]=useState<Record<string,number>>({});
  const [saveStates,setSaveStates]=useState<Record<string,SaveState>>({}); const [activeFileId,setActiveFileId]=useState<string|null>(null);
  const [loading,setLoading]=useState(true); const [error,setError]=useState(""); const [busy,setBusy]=useState("");
  const [run,setRun]=useState<LabRunResult|null>(null); const [assistance,setAssistance]=useState(""); const [submitResult,setSubmitResult]=useState<LabSubmitResult|null>(null);
  const timers=useRef<Record<string,number>>({}); const chains=useRef<Record<string,Promise<void>>>({}); const draftsRef=useRef(drafts); const versionsRef=useRef(versions); const labRef=useRef(lab); const editEpoch=useRef<Record<string,number>>({}); const savedEpoch=useRef<Record<string,number>>({});
  draftsRef.current=drafts; versionsRef.current=versions; labRef.current=lab;

  const applyLab=useCallback((value:LabState)=>{
    setLab(value);labRef.current=value;
    const nextDrafts=Object.fromEntries(value.files.map(file=>[file.fileId,file.draft??file.content??""]));
    const nextVersions=Object.fromEntries(value.files.map(file=>[file.fileId,file.version??0]));
    setDrafts(nextDrafts);draftsRef.current=nextDrafts;setVersions(nextVersions);versionsRef.current=nextVersions;
    editEpoch.current=Object.fromEntries(value.files.map(file=>[file.fileId,0]));savedEpoch.current={...editEpoch.current};setSaveStates(Object.fromEntries(value.files.map(file=>[file.fileId,"saved" as SaveState])));setRun(value.completion?.run??null);
    const remembered=window.localStorage.getItem(`adaptive-lab-file:${value.labId}`);
    const selected=value.files.find(file=>file.fileId===remembered)??value.files.find(file=>file.role==="YOU_BUILD")??value.files[0]??null;
    setActiveFileId(selected?.fileId??null);
  },[]);

  const loadLab=useCallback(async(id:string)=>{const value=await api.lab(auth.token,id);applyLab(value);return value;},[applyLab,auth.token]);
  const load=useCallback(async()=>{setLoading(true);setError("");try{let id=resolveLabEntry(requestedLab,null);if(!id){const continuation=await api.continuation(auth.token);id=resolveLabEntry(null,continuation.nextLabId);}if(!id){setLabId(null);setLab(null);return;}setLabId(id);await loadLab(id);}catch(reason){setError(message(reason));setLab(null);}finally{setLoading(false);}},[auth.token,loadLab,requestedLab]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>()=>{Object.values(timers.current).forEach(timer=>window.clearTimeout(timer));},[]);
  useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(Object.values(saveStates).some(state=>state==="dirty"||state==="saving")){event.preventDefault();event.returnValue="";}};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[saveStates]);

  const queueSave=useCallback((fileId:string)=>{
    window.clearTimeout(timers.current[fileId]);
    const next=(chains.current[fileId]??Promise.resolve()).catch(()=>undefined).then(async()=>{
      const currentLab=labRef.current;const file=currentLab?.files.find(value=>value.fileId===fileId);
      if(!currentLab?.attemptId||!file||!canEditFile(file.role,currentLab.status,currentLab.attemptId))return;
      const epoch=editEpoch.current[fileId]??0;setSaveStates(states=>({...states,[fileId]:"saving"}));
      try{const saved=await api.saveLabDraft(auth.token,{attemptId:currentLab.attemptId,fileId,content:draftsRef.current[fileId]??"",version:(versionsRef.current[fileId]??0)+1});versionsRef.current={...versionsRef.current,[fileId]:saved.version};setVersions(versionsRef.current);savedEpoch.current[fileId]=epoch;setSaveStates(states=>({...states,[fileId]:(editEpoch.current[fileId]??0)===epoch?"saved":"dirty"}));}
      catch(reason){setSaveStates(states=>({...states,[fileId]:"error"}));throw reason;}
    });
    chains.current[fileId]=next;return next;
  },[auth.token]);
  useEffect(()=>()=>{const current=labRef.current;if(!current)return;for(const file of current.files){if(canEditFile(file.role,current.status,current.attemptId)&&(savedEpoch.current[file.fileId]??0)!==(editEpoch.current[file.fileId]??0))void queueSave(file.fileId).catch(()=>undefined);}},[queueSave]);

  function edit(fileId:string,content:string){draftsRef.current={...draftsRef.current,[fileId]:content};setDrafts(draftsRef.current);editEpoch.current[fileId]=(editEpoch.current[fileId]??0)+1;setSaveStates(states=>({...states,[fileId]:"dirty"}));window.clearTimeout(timers.current[fileId]);timers.current[fileId]=window.setTimeout(()=>void queueSave(fileId).catch(reason=>setError(message(reason))),850);}
  async function flushFile(fileId:string){window.clearTimeout(timers.current[fileId]);for(let pass=0;pass<3;pass++){await(chains.current[fileId]??Promise.resolve()).catch(()=>undefined);if((savedEpoch.current[fileId]??0)===(editEpoch.current[fileId]??0))return;await queueSave(fileId);}}
  async function flushAll(){const current=labRef.current;if(!current)return;await Promise.all(current.files.filter(file=>canEditFile(file.role,current.status,current.attemptId)).map(file=>flushFile(file.fileId)));}
  function selectFile(fileId:string){if(activeFileId&&["dirty","error"].includes(saveStates[activeFileId]??""))void flushFile(activeFileId).catch(reason=>setError(message(reason)));setActiveFileId(fileId);if(labId)window.localStorage.setItem(`adaptive-lab-file:${labId}`,fileId);}
  async function action(name:string,work:()=>Promise<void>){if(busy)return;setBusy(name);setError("");try{await work();}catch(reason){setError(message(reason));}finally{setBusy("");}}
  async function refresh(){if(labId)await loadLab(labId);}

  const activeFile=lab?.files.find(file=>file.fileId===activeFileId)??null;
  const overview=stringValue(lab?.context.overview)||stringValue(lab?.context.requiredPracticeOutcome)||"Complete the practical outcome prepared for this unit.";
  const expected=stringValue(lab?.context.goal)||stringValue(lab?.context.requiredPracticeOutcome);const criteria=arrayValue(lab?.context.evaluationCriteria);
  const buckets=useMemo(()=>evidenceBuckets(lab?.completion?.evidence??[]),[lab?.completion?.evidence]);

  if(loading)return <WorkspaceState title="Loading lab workspace" detail="Restoring files, saved drafts, hints, and execution state…" busy/>;
  if(!lab&&error)return <WorkspaceState title="We couldn’t open this lab" detail={error} action="Try again" onAction={()=>void load()}/>;
  if(!lab||!labId)return <WorkspaceState title="No current lab" detail="Complete the available unit teaching. The backend will unlock its practical lab." action="Return to Learn" onAction={()=>navigate("/learn")}/>;

  const started=lab.status==="IN_PROGRESS"&&Boolean(lab.attemptId);const completed=lab.status==="COMPLETE";
  return <div className="lab-workspace">
    <aside className="lab-left">
      <div className="lab-title"><span className="eyebrow">PRACTICAL LAB</span><h1>{lab.title}</h1><span className={`lab-status ${lab.status.toLowerCase()}`}>{lab.status.replaceAll("_"," ")}</span></div>
      <details open className="lab-overview"><summary>Overview</summary><p>{overview}</p>{expected?<><h3>Expected outcome</h3><p>{expected}</p></>:null}</details>
      {criteria.length?<details open className="lab-overview"><summary>Requirements</summary><ul>{criteria.map((item,index)=><li key={index}>{item}</li>)}</ul></details>:null}
      <details open className="lab-overview"><summary>Concepts tested</summary><div className="lab-concepts">{lab.concepts.map(concept=><span key={concept.conceptId}>{concept.name}</span>)}</div></details>
      <nav className="file-tree" aria-label="Lab files"><div><h2>Project files</h2><span>{lab.files.length}</span></div>{lab.files.map(file=><button key={file.fileId} className={file.fileId===activeFileId?"active":""} onClick={()=>selectFile(file.fileId)}><span className={`file-role-dot ${file.role.toLowerCase()}`}/><span><strong>{file.path}</strong><small>{roleLabel(file.role)}</small></span>{saveStates[file.fileId]==="dirty"?<b>●</b>:null}</button>)}</nav>
      <div className="lab-progress"><span>Hints used</span><strong>{lab.hintsUsed??lab.completion?.hintsUsed??0} / 2</strong><span>Editable files</span><strong>{lab.files.filter(file=>file.role==="YOU_BUILD").length}</strong></div>
    </aside>

    <main className="lab-center">
      {!started&&!completed?<LabStart lab={lab} allowed={lab.status==="READY"} busy={Boolean(busy)} onStart={()=>void action("start",async()=>{await api.startLab(auth.token,lab.labId);await refresh();})}/>:activeFile?<FileWorkspace file={activeFile} value={drafts[activeFile.fileId]??""} editable={canEditFile(activeFile.role,lab.status,lab.attemptId)} saveState={saveStates[activeFile.fileId]??"idle"} onChange={value=>edit(activeFile.fileId,value)} onRetry={()=>void action("save",async()=>flushFile(activeFile.fileId))}/>:<WorkspaceState title="No project files" detail="This lab has no generated files available."/>}
    </main>

    <aside className="lab-right">
      {error?<div className="lab-error"><strong>Action failed</strong><p>{error}</p><button onClick={()=>setError("")}>Dismiss</button></div>:null}
      <Panel title="Run checks" badge={run?.status??lab.completion?.run?.status??"Not run"}><RunResult run={run??lab.completion?.run??null}/>{!completed?<button className="lab-secondary" disabled={!started||Boolean(busy)} onClick={()=>void action("run",async()=>{await flushAll();if(!lab.attemptId)return;const result=await api.runLab(auth.token,lab.attemptId);setRun({...result,createdAt:new Date().toISOString()});})}>{busy==="run"?"Running…":"Run checks"}</button>:null}</Panel>
      <Panel title="Hints" badge={`${lab.hintsUsed??lab.completion?.hintsUsed??0} of 2`}><FileHints lab={lab} file={activeFile}/>{activeFile&&canUseHint(activeFile.role,lab.hintsUsed??0,lab.attemptId)&&!completed?<button className="hint-button" disabled={Boolean(busy)} onClick={()=>void action("hint",async()=>{await flushAll();if(!lab.attemptId)return;await api.labHint(auth.token,lab.attemptId,activeFile.fileId);await refresh();})}>💡 Use Hint {hintNumber(lab.hintsUsed??0)} for this file</button>:null}{(lab.hintsUsed??0)>=2&&!lab.systemAssistanceUsed&&!completed?<button className="lab-secondary" disabled={Boolean(busy)} onClick={()=>void action("assistance",async()=>{await flushAll();if(!lab.attemptId)return;const result=await api.systemAssistance(auth.token,lab.attemptId);setAssistance(result.content);await refresh();})}>{busy==="assistance"?"Preparing assistance…":"Request System Assistance"}</button>:null}{lab.systemAssistanceUsed||lab.completion?.systemAssistanceUsed?<div className="assistance-result"><strong>System Assistance used</strong><p>{assistance||"The assistance level is saved with this attempt."}</p></div>:null}</Panel>
      <Panel title="Submission" badge={submissionBadge(lab)}>{lab.completion?.submission?<SubmissionSummary lab={lab}/>:<p className="panel-help">Run checks when ready, then submit the saved workspace for backend evaluation.</p>}{!completed?<button className="lab-primary" disabled={!started||Boolean(busy)} onClick={()=>void action("submit",async()=>{await flushAll();if(!lab.attemptId)return;const result=await api.submitLab(auth.token,lab.attemptId);setSubmitResult(result);await refresh();})}>{busy==="submit"?"Submitting…":"Submit Lab"}</button>:null}</Panel>
      {(completed||Boolean(lab.completion?.evidence.length))?<EvidenceSummary lab={lab} buckets={buckets}/>:null}
      {(submitResult?.passed||completed)?<button className="lab-primary next" onClick={()=>navigate(nextActionRoute(submitResult?.nextAction??lab.nextAction))}>{nextActionLabel(submitResult?.nextAction??lab.nextAction)} <span>→</span></button>:null}
      <button className="lab-exit" onClick={()=>void action("exit",async()=>{await flushAll();await auth.refresh();navigate("/home");})}>Save and return Home</button>
    </aside>
  </div>;
}

function LabStart({lab,allowed,busy,onStart}:{lab:LabState;allowed:boolean;busy:boolean;onStart:()=>void}){return <section className="lab-start"><div className="lab-start-icon">⌘</div><span className="eyebrow">{allowed?"WORKSPACE READY":"LAB UNAVAILABLE"}</span><h2>{allowed?"Start your practical lab":"This lab is still locked"}</h2><p>{allowed?"Your generated files and requirements are saved with this unit. Starting creates the shared attempt used by web and mobile.":"Complete the backend-required teaching and progression steps before starting this lab."}</p><div className="start-stats"><span><strong>{lab.files.length}</strong> files</span><span><strong>{lab.files.filter(file=>file.role==="YOU_BUILD").length}</strong> editable</span><span><strong>2</strong> hints available</span></div><button className="lab-primary" disabled={busy||!allowed} onClick={onStart}>{busy?"Starting…":allowed?"Start lab":"Lab locked"} <span>→</span></button></section>;}
function FileWorkspace({file,value,editable,saveState,onChange,onRetry}:{file:LabFile;value:string;editable:boolean;saveState:SaveState;onChange:(value:string)=>void;onRetry:()=>void}){return <section className="file-workspace"><header><div><span className={`file-role ${file.role.toLowerCase()}`}>{roleLabel(file.role)}</span><h2>{file.path}</h2></div><div className={`save-indicator ${saveState}`} role="status"><span>●</span>{saveStateLabel(saveState)}{saveState==="error"?<button onClick={onRetry}>Retry</button>:null}</div></header>{file.humanMeaning||file.learningPurpose?<div className="file-context">{file.humanMeaning?<p><strong>Purpose:</strong> {file.humanMeaning}</p>:null}{file.learningPurpose?<p><strong>Learning focus:</strong> {file.learningPurpose}</p>:null}{file.inputOutput?<p><strong>Input/output:</strong> {file.inputOutput}</p>:null}</div>:null}<div className="editor-shell"><div className="editor-top"><span>{extension(file.path)}</span><span>{editable?"Editable workspace":"Read only"}</span></div>{editable?<textarea aria-label={`Edit ${file.path}`} value={value} onChange={event=>onChange(event.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} wrap="off"/>:<pre tabIndex={0} aria-label={`Read-only ${file.path}`}><code>{value}</code></pre>}</div></section>;}
function Panel({title,badge,children}:{title:string;badge:string;children:ReactNode}){return <section className="lab-panel"><div className="lab-panel-title"><h2>{title}</h2><span>{badge}</span></div>{children}</section>;}
function RunResult({run}:{run:LabRunResult|null}){if(!run)return <p className="panel-help">No checks have been run for this attempt.</p>;const checks=Array.isArray(run.result.checks)?run.result.checks.filter((item):item is Record<string,unknown>=>Boolean(item)&&typeof item==="object"):[];return <div className={`run-result ${run.status.toLowerCase()}`}><strong>{run.status==="PASSED"?"Checks passed":run.status==="FAILED"?"Checks need attention":"Run error"}</strong>{checks.map((check,index)=><div key={index}><span>{check.passed?"✓":"×"}</span>{String(check.code??`Check ${index+1}`)}</div>)}{typeof run.result.missingLearnerFiles==="number"&&run.result.missingLearnerFiles>0?<p>{run.result.missingLearnerFiles} editable file(s) still need content.</p>:null}</div>;}
function FileHints({lab,file}:{lab:LabState;file:LabFile|null}){if(!file)return <p className="panel-help">Select an editable file for file-specific guidance.</p>;const hints=lab.hints.filter(hint=>hint.fileId===file.fileId);if(!hints.length)return <p className="panel-help">No hints used for {file.path}.</p>;return <div className="file-hints">{hints.map(hint=><article key={hint.hintNumber}><strong>Hint {hint.hintNumber} · {file.path}</strong><p>{hint.hint}</p></article>)}</div>;}
function SubmissionSummary({lab}:{lab:LabState}){const submission=lab.completion?.submission;if(!submission)return null;return <div className={`submission-summary ${submission.completed?"passed":"failed"}`}><strong>{submission.completed?"Submission completed":"Submission needs more work"}</strong><p>Assistance: {String(submission.evaluation.assistanceLevel??"Not recorded").replaceAll("_"," ").toLowerCase()}</p><p>Runs considered: {String(submission.evaluation.runCount??0)}</p></div>;}
function EvidenceSummary({lab,buckets}:{lab:LabState;buckets:ReturnType<typeof evidenceBuckets>}){return <section className="evidence-summary"><span className="eyebrow">EVIDENCE RESULT</span><h2>Capability evidence</h2><EvidenceGroup title="Completed independently" items={buckets.demonstrated}/><EvidenceGroup title="Completed with assistance" items={buckets.assisted}/><EvidenceGroup title="Not demonstrated" items={buckets.notDemonstrated}/>{!lab.completion?.evidence.length?<p className="panel-help">Evidence will appear after backend evaluation.</p>:null}</section>;}
function EvidenceGroup({title,items}:{title:string;items:LabEvidenceResult[]}){if(!items.length)return null;return <div><h3>{title}</h3>{items.map(item=><article key={item.evidenceId}><strong>{item.conceptName??item.conceptId??"Lab capability"}</strong><span>{item.assistanceLevel.replaceAll("_"," ").toLowerCase()}</span></article>)}</div>;}
function WorkspaceState({title,detail,busy,action,onAction}:{title:string;detail:string;busy?:boolean;action?:string;onAction?:()=>void}){return <section className="learn-state">{busy?<div className="spinner"/>:<div className="state-icon">!</div>}<h2>{title}</h2><p>{detail}</p>{action?<button className="primary-button compact" onClick={onAction}>{action}</button>:null}</section>;}
function stringValue(value:unknown){return typeof value==="string"?value:"";}function arrayValue(value:unknown){return Array.isArray(value)?value.filter((item):item is string=>typeof item==="string"):[];}function extension(path:string){return path.includes(".")?path.split(".").at(-1)?.toUpperCase()??"CODE":"CODE";}function submissionBadge(lab:LabState){if(lab.status==="COMPLETE")return"Complete";if(lab.completion?.submission)return lab.completion.submission.completed?"Passed":"Needs work";return"Not submitted";}function message(reason:unknown){return reason instanceof Error?reason.message:"Something went wrong. Try again.";}
