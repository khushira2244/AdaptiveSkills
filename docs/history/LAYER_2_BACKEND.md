# Layer 2 backend: Home, commerce and RevenueCat

> Historical implementation checkpoint. See the current [commerce documentation](../commerce-revenuecat.md).

The backend treats PostgreSQL as the application entitlement source of truth. The mobile RevenueCat SDK presents store products and localized prices; it never sends a trusted `isPaid` flag.

## Environment

Set these server-only values in `.env`:

```text
REVENUECAT_WEBHOOK_AUTH_TOKEN=<long random value configured as the webhook Authorization header>
REVENUECAT_SECRET_API_KEY=<RevenueCat secret API key>
# Required only when REVENUECAT_SECRET_API_KEY is a v2 key:
REVENUECAT_PROJECT_ID=<RevenueCat project ID beginning with proj>
REVENUECAT_ENTITLEMENT_ID=adaptive_labs_pro
REVENUECAT_OFFERING_ID=default
```

The public iOS and Android SDK keys belong in the mobile build configuration, not the backend environment. Do not expose either server value in React Native.

## API

All `/me/*` endpoints require the existing bearer session.

- `GET /me/home` returns one frontend-oriented unpaid, purchase-pending or paid Home state. Its offer deliberately has null price fields and `pricingSource: REVENUECAT_SDK`; the device store's RevenueCat package `priceString` is the display price.
- `POST /me/purchases/intent` accepts `{ platform: "ios" | "android", countryCode?: "IN" }`. It creates one idempotent pending attempt and returns the stable RevenueCat App User ID. Configure/log in the RevenueCat SDK with this exact ID before purchase.
- `POST /me/purchases/outcome` accepts a pending attempt ID and `CANCELLED` or `FAILED`. Neither outcome activates access.
- `POST /me/commerce/reconcile` refreshes local entitlement state from RevenueCat. Legacy server keys use the v1 Customer endpoint. V2 keys use the project-scoped active-entitlements endpoint and require `REVENUECAT_PROJECT_ID`. Use it after an SDK purchase while waiting for a webhook, and during restore when local state appears stale.
- `GET /me/billing` returns verified persisted purchase information or an empty state. It never fabricates a receipt or store-management URL.
- `POST /webhooks/revenuecat` is public but requires an exact `Authorization` header matching `REVENUECAT_WEBHOOK_AUTH_TOKEN`.

## Purchase flow

1. Fetch `/me/home` and configure RevenueCat with `revenueCat.appUserId`.
2. Load the configured RevenueCat offering/package on the device. Display only its store-provided `priceString`.
3. Create `/me/purchases/intent`, then invoke the SDK purchase once.
4. On user cancellation or SDK failure, post `/me/purchases/outcome` and return to unpaid Home.
5. On SDK success, call `/me/commerce/reconcile`, then fetch `/me/home` until it reports `TRIAL_PAID_SETUP_PENDING`. The webhook independently performs the same verified activation.

Webhook event IDs are persisted for idempotency. Activation is transactional, one learner has one trial state, and older events cannot overwrite a newer entitlement event. `INITIAL_PURCHASE`, `NON_RENEWING_PURCHASE`, `PURCHASE_REDEEMED`, and `TEMPORARY_ENTITLEMENT_GRANT` activate only when the configured entitlement is present. Cancellation/expiration revokes it.

## Local verification

```powershell
docker compose up -d postgres
npm run db:migrate
npm run test:db
```

Migration `003_layer2_commerce.sql` adds customer mapping, trial state, purchase attempts, entitlements, billing transactions and webhook audit records.

## Mobile Test Store verification

Run the API and Expo from the repository root so Expo receives the public Test Store key from the root `.env`:

```powershell
npm run start
npm run mobile:android
```

RevenueCat purchases require an Expo development build; Expo Go can render the screens but cannot complete a real SDK purchase. Build the development client from `apps/mobile/eas.json`, install it, then use `npm run mobile:start` to connect it. The Test Store checkout lets you choose success, cancellation or failure. After success, the app reconciles the verified entitlement with the backend and will render paid Home only when `/me/home` returns `TRIAL_PAID_SETUP_PENDING`.

For the current India-only launch, the mobile app reads only the `default` offering and explicitly selects `try_it_inr` for every device locale. Its product must grant the configured `adaptive_labs_pro` entitlement. The displayed amount and currency always come from RevenueCat's `package.product.priceString`. When international sales are enabled, add `try_it_usd` to `default` and restore country-based selection.
