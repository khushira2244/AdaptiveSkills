# Mobile

`apps/mobile` is the shared Expo/React Native application for Android, iPhone, and iPad. Both platform identifiers are `com.adaptivelabs.adaptiveskills`.

## Layout and navigation

The client uses safe-area insets for status bars, notches, and the bottom home indicator. Scrollable screens keep bottom actions reachable above system navigation. Keyboard-aware containers keep focused inputs visible and allow natural dismissal. Content is width-limited on larger iPad layouts; portrait is primary and iPad landscape is supported by the Expo orientation plugin.

Home, Learn, My Work, and You use the existing mobile navigation. Android system Back exits from Home and moves to the owning parent from inner screens. It does not return to a generator, open a different lab, or regenerate completed content.

The native splash and session bootstrap remain visible while secure session restoration and backend state load. Loading, retry, and error states do not invent progress locally. Sessions are stored with Expo SecureStore.

## RevenueCat

The native client configures RevenueCat with the backend-provided App User ID, loads the exact offering/package, displays `priceString`, opens the purchase sheet, and asks the backend to reconcile. Initial and continuation purchases use separate entitlements. See [Commerce and RevenueCat](commerce-revenuecat.md).

## Build profiles

Run EAS from `apps/mobile`:

| Profile | Purpose |
| --- | --- |
| `production-apk` | Internal-distribution Android release APK |
| `hackathon-apk` | Debuggable installable APK compatible with RevenueCat Test Store |
| `ios-preview` | Physical iPhone/iPad preview, subject to Apple signing/provisioning |
| `ios-simulator` | Development-client simulator build |

```powershell
cd apps/mobile
npx --yes eas-cli@latest build --platform android --profile hackathon-apk
```

The hackathon profile uses the EAS `production` environment, so it calls the deployed Cloud Run API while retaining a debug build type for Test Store compatibility. A public `EXPO_PUBLIC_REVENUECAT_API_KEY` is allowed; server secrets are forbidden.

Local iOS simulator and Xcode validation require macOS. Building or installing on a physical Apple device also requires the appropriate Apple Developer signing and provisioning.
