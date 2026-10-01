# Commerce and RevenueCat

RevenueCat is the access layer for the native product. The adaptive engine, learning state, and evidence remain backend concerns.

## Configured access

| Stage | Offering | Package | Entitlement | Product |
| --- | --- | --- | --- | --- |
| Initial TRY_IT | `default` | configured initial package | `adaptive_labs_pro` | configured initial product |
| Continuation | `continuation` | `growth_runway` | `adaptive_labs_growth` | `adaptive_labs_growth_799` |

The initial and continuation entitlements are intentionally separate. `adaptive_labs_pro` is not sufficient to activate a growth runway.

## Purchase and reconciliation

The native SDK loads the configured offering and package and displays RevenueCat's localized `priceString`. It creates a backend purchase intent before opening the purchase sheet. Cancellation and failure leave access locked; a successful SDK callback still does not activate access locally. The API verifies or reconciles the entitlement for the current RevenueCat App User ID before updating persisted commerce state.

Webhook event IDs and purchase attempts provide idempotency. Restore and app restart use the same reconciliation path. If `adaptive_labs_growth` is already active, the continuation paywall is skipped and the backend prepares the first next unit before returning the learner to Home.

Web Billing displays the backend-verified state. It can request reconciliation after a mobile purchase, but it does not imitate a native purchase or create an entitlement.

## Hackathon Test Store

The hackathon Android profile is a debuggable, installable APK because RevenueCat Test Store keys are rejected by normal Android release builds. It still uses the production API. Test Store can simulate success, cancellation, failure, and restore without real payment processing.

The public RevenueCat SDK key may be present in the native build. `REVENUECAT_SECRET_API_KEY` and `REVENUECAT_WEBHOOK_AUTH_TOKEN` are server-only Secret Manager values and must never be bundled into mobile or web.
