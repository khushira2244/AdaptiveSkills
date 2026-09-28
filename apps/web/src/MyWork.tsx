import type { LabWorkSummary } from "@adaptive-labs/contracts";
import { useEffect,useState } from "react";
import { Link,useSearchParams } from "react-router-dom";
import { api } from "./api";
import { useAuth } from "./auth";
import { LabBoundary } from "./LabBoundary";
import { workRouteMode } from "./my-work-model";

export function MyWork(){
  const auth=useAuth();if(auth.status!=="authenticated")throw new Error("My Work requires an authenticated session");
  const [search]=useSearchParams();
  if(workRouteMode(search)==="LAB")return <LabBoundary/>;
  return <WorkHistory token={auth.token}/>;
}

function WorkHistory({token}:{token:string}){
  const [items,setItems]=useState<LabWorkSummary[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState("");
  async function load(){setLoading(true);setError("");try{setItems(await api.labHistory(token));}catch(reason){setError(message(reason));}finally{setLoading(false);}}
  useEffect(()=>{void load();},[token]);
  return <section className="work-history" aria-labelledby="work-title"><header className="surface-heading"><span className="eyebrow">YOUR PRACTICAL WORK</span><h1 id="work-title">My Work</h1><p>Labs, submissions, and evidence from your shared AdaptiveSkills learning record.</p></header>
    {loading?<WorkState busy title="Loading your work" detail="Retrieving saved labs and evidence…"/>:error?<WorkState title="We couldn’t load your work" detail={error} action="Try again" onAction={()=>void load()}/>:items.length===0?<WorkState title="No practical work yet" detail="Complete your current unit teaching to unlock its practical lab." action="Go to Learn" href="/learn"/>:<div className="work-list">{items.map(item=><WorkCard key={item.labId} item={item}/>)}</div>}
  </section>;
}

function WorkCard({item}:{item:LabWorkSummary}){
  const active=item.status==="IN_PROGRESS";const complete=item.status==="COMPLETE";
  return <article className="work-card"><div className="work-card-main"><div className="work-card-heading"><span className={`status-chip ${item.status.toLowerCase()}`}>{label(item.status)}</span><time dateTime={item.updatedAt}>Updated {new Date(item.updatedAt).toLocaleDateString()}</time></div><h2>{item.title}</h2><p>{item.unitTitle}</p><div className="work-metrics"><Metric label="Submission" value={item.submission?(item.submission.completed?"Passed":"Needs review"):"Not submitted"}/><Metric label="Evidence demonstrated" value={String(item.evidence.demonstrated)}/><Metric label="Partial / not demonstrated" value={`${item.evidence.partial} / ${item.evidence.notDemonstrated}`}/><Metric label="Hints used" value={String(item.attempt?.hintsUsed??0)}/></div></div><div className="work-actions"><Link className="primary-link" to={`/work?lab=${item.labId}`}>{active?"Resume lab":complete?"View result":"Open lab"} →</Link><Link className="secondary-link" to={`/learn?unit=${item.unitId}`}>View unit</Link></div></article>;
}
function Metric({label:caption,value}:{label:string;value:string}){return <div><span>{caption}</span><strong>{value}</strong></div>;}
function WorkState({title,detail,busy=false,action,onAction,href}:{title:string;detail:string;busy?:boolean;action?:string;onAction?:()=>void;href?:string}){return <div className="work-state" role={busy?"status":"alert"}>{busy?<span className="spinner"/>:null}<h2>{title}</h2><p>{detail}</p>{href?<Link className="primary-link" to={href}>{action} →</Link>:action?<button className="secondary-button" onClick={onAction}>{action}</button>:null}</div>;}
function label(value:string){return value.replaceAll("_"," ").toLowerCase().replace(/^./,letter=>letter.toUpperCase());}
function message(reason:unknown){return reason instanceof Error?reason.message:"Something went wrong. Try again.";}
