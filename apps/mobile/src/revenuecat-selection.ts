export const REVENUECAT_PACKAGE_IDS = {
  india: "try_it_inr",
  international: "try_it_usd",
} as const;

export function packageIdForCountry(countryCode: string | null | undefined) {
  void countryCode;
  return REVENUECAT_PACKAGE_IDS.india;
}

export function packageIdForOffer(countryCode:string|null|undefined,requiredPackageId?:string){
  return requiredPackageId??packageIdForCountry(countryCode);
}
