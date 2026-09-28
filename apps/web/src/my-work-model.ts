export function workRouteMode(search:Pick<URLSearchParams,"get">){return search.get("lab")||search.get("current")==="1"?"LAB" as const:"HISTORY" as const;}
