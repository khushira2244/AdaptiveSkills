import type { ContinuationState } from "./types";

export function homeLabForUnit(unitId:string,state:ContinuationState|null):string|null{
  return state?.nextUnitId===unitId && (state.nextAction==="START_LAB"||state.nextAction==="RESUME_LAB")
    ? state.nextLabId : null;
}
