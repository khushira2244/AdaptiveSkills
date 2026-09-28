import type { HomeState } from "@adaptive-labs/contracts";

type Action = HomeState["primaryAction"]["type"];

export function actionButton(action?: Action) {
  if (action === "START_TRIAL_PURCHASE") return "View trial access";
  if (action === "WAIT_FOR_PURCHASE" || action === "WAIT_REFRESH") return "Refresh status";
  if (action === "CONTINUE_TRIAL_SETUP") return "Continue setup";
  if (action === "START_LAB") return "Open lab";
  if (action === "RESUME_LAB") return "Resume lab";
  if (action === "DOUBT_CLEARANCE") return "Review doubts";
  if (action === "REVIEW_NEXT_RUNWAY" || action === "VIEW_NEXT_RUNWAY") return "Review runway";
  return "Continue learning";
}

export function routeForAction(action?: Action) {
  if (action === "START_TRIAL_PURCHASE") return "/billing";
  if (action === "CONTINUE_TRIAL_SETUP") return "/setup";
  if (action === "START_LAB" || action === "RESUME_LAB") return "/work?current=1";
  if (action === "WAIT_FOR_PURCHASE" || action === "REVIEW_NEXT_RUNWAY" || action === "VIEW_NEXT_RUNWAY") return "/billing";
  return "/learn";
}
