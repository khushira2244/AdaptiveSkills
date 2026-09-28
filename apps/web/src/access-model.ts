import type { BillingState,ContinuationState } from "@adaptive-labs/contracts";

export function accessTypeLabel(value:BillingState["access"]["type"]){return value==="CONTINUATION"?"Growth runway active":value==="INITIAL"?"TRY_IT access active":"No active access";}
export function continuationView(status:ContinuationState["status"]){
  if(status==="CURRENT_RUNWAY_COMPLETE")return"ANALYZE" as const;
  if(status==="NEXT_RUNWAY_AWAITING_PURCHASE")return"PURCHASE_REQUIRED" as const;
  if(status==="NEXT_RUNWAY_PURCHASED")return"VERIFYING" as const;
  if(status==="NEXT_RUNWAY_READY"||status==="ACTIVE")return"ACTIVE" as const;
  return"STATUS" as const;
}
