import type { LabEvidenceResult, LabFileRole, LabState } from "@adaptive-labs/contracts";

export type SaveState="idle"|"dirty"|"saving"|"saved"|"error";

export function canEditFile(role:LabFileRole,labStatus:LabState["status"],attemptId:string|null){return role==="YOU_BUILD"&&labStatus==="IN_PROGRESS"&&Boolean(attemptId);}
export function roleLabel(role:LabFileRole){return role==="YOU_BUILD"?"YOU BUILD":role.replaceAll("_"," ");}
export function saveStateLabel(state:SaveState){return state==="dirty"?"Unsaved":state==="saving"?"Saving…":state==="saved"?"Saved":state==="error"?"Save failed":"Saved";}
export function canUseHint(role:LabFileRole,hintsUsed:number,attemptId:string|null){return role==="YOU_BUILD"&&Boolean(attemptId)&&hintsUsed<2;}
export function hintNumber(hintsUsed:number){return Math.min(2,hintsUsed+1) as 1|2;}
export function resolveLabEntry(requestedLabId:string|null,nextLabId:string|null){return requestedLabId??nextLabId;}
export function evidenceBuckets(evidence:LabEvidenceResult[]){return{
  demonstrated:evidence.filter(item=>item.outcome==="DEMONSTRATED"&&item.assistanceLevel==="INDEPENDENT"),
  assisted:evidence.filter(item=>item.outcome==="PARTIAL"||item.assistanceLevel!=="INDEPENDENT"&&item.outcome!=="NOT_DEMONSTRATED"),
  notDemonstrated:evidence.filter(item=>item.outcome==="NOT_DEMONSTRATED"),
};}
export function nextActionRoute(action:string){return action==="DOUBT_CLEARANCE"?"/learn":action==="CONTINUE_LEARNING"?"/learn":"/home";}
export function nextActionLabel(action:string){return action==="DOUBT_CLEARANCE"?"Clear doubts":action==="CONTINUE_LEARNING"?"Continue learning":action==="REVIEW_NEXT_RUNWAY"||action==="VIEW_NEXT_RUNWAY"?"Review next runway":"Return Home";}
