import Purchases, { LOG_LEVEL, type PurchasesPackage } from "react-native-purchases";
import { packageIdForOffer } from "./revenuecat-selection";

const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;

export type StoreOffer = { package: PurchasesPackage; packageId: string; priceString: string; productId: string; countryCode: string | null };

export async function loadRevenueCatOffer(appUserId: string, offeringId: string, countryCode: string | null, requiredPackageId?:string): Promise<StoreOffer> {
  if (!apiKey) throw new Error("RevenueCat public API key is missing from the mobile environment.");
  const configured = await Purchases.isConfigured();
  if (!configured) {
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
    Purchases.configure({ apiKey, appUserID: appUserId });
  } else if (await Purchases.getAppUserID() !== appUserId) {
    await Purchases.logIn(appUserId);
  }
  const offerings = await Purchases.getOfferings();
  const offering = offerings.all[offeringId] ?? (offerings.current?.identifier === offeringId ? offerings.current : null);
  if (!offering) throw new Error(`RevenueCat offering '${offeringId}' is not available.`);
  const packageId = packageIdForOffer(countryCode,requiredPackageId);
  const selected = offering.availablePackages.find(storePackage => storePackage.identifier === packageId);
  if (!selected) throw new Error(`RevenueCat package '${packageId}' is missing from the '${offeringId}' offering.`);
  return { package: selected, packageId, priceString: selected.product.priceString, productId: selected.product.identifier, countryCode };
}

export async function purchaseRevenueCatPackage(storePackage: PurchasesPackage) {
  return Purchases.purchasePackage(storePackage);
}

export async function restoreRevenueCatPurchases() {
  return Purchases.restorePurchases();
}

export function revenueCatFailure(error: unknown) {
  const value = error as { userCancelled?: boolean; code?: string | number; message?: string };
  return { cancelled: value?.userCancelled === true || value?.code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR, code: String(value?.code || "PURCHASE_FAILED"), message: value?.message || "The purchase could not be completed." };
}
