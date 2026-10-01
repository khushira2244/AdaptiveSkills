import type { ContinuationState,LabWorkSummary,LearningUnit } from "./types";

export function homeLabForUnit(unitId:string,state:ContinuationState|null):string|null{
  return state?.nextUnitId===unitId && (state.nextAction==="START_LAB"||state.nextAction==="RESUME_LAB")
    ? state.nextLabId : null;
}

export function labForUnit(unitId:string,labs:LabWorkSummary[]):LabWorkSummary|null{
  return labs.find(lab=>lab.unitId===unitId)??null;
}

export function unitStatusLabel(status:LearningUnit["status"]):string{
  if(status==="COMPLETE")return "Completed";
  if(status==="DOUBT_CHECKPOINT")return "Doubt clearance";
  if(status==="LOCKED")return "Locked";
  return "Current";
}

export function canOpenUnit(status:LearningUnit["status"]):boolean{return status!=="LOCKED";}

export function shouldGenerateTeaching(status:LearningUnit["status"],readStatus:number):boolean{
  return readStatus===404&&status!=="COMPLETE"&&status!=="DOUBT_CHECKPOINT";
}

export function labContinueLabel(action:ContinuationState["nextAction"]):string{
  if(action==="DOUBT_CLEARANCE")return "Continue to doubt clearance";
  if(action==="REVIEW_NEXT_RUNWAY"||action==="VIEW_NEXT_RUNWAY")return "Return to Home";
  return "Continue to next unit";
}

export function appBackAction(route:string):"EXIT"|"HOME"|"PAID_HOME"|"DEFER"{
  if(route==="home"||route==="paidHome")return "EXIT";
  if(route==="billing"||route==="continuation")return "PAID_HOME";
  if(route==="payment")return "HOME";
  return "DEFER";
}
