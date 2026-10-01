# AdaptiveSkills native app

For the canonical platform guide, see [docs/mobile.md](../../docs/mobile.md).

`apps/mobile` is the shared Expo/React Native client for Android, iPhone, and iPad. All platforms use the existing AdaptiveSkills API as the source of truth for authentication, onboarding, learning scope, progress, teaching, labs, notes, evidence, entitlements, and continuation state.

## Platform support

| Platform | Support |
| --- | --- |
| Android phones and tablets | Expo/React Native app, native Android project, and EAS APK profile |
| iPhone | Portrait native experience with safe-area and keyboard handling |
| iPad | Portrait and landscape support with centered, width-limited content |

The Android application ID and iOS bundle ID are both `com.adaptivelabs.adaptiveskills`.

## Mobile-safe environment

Create `apps/mobile/.env` from `.env.example` for local development:

```dotenv
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000
EXPO_PUBLIC_REVENUECAT_API_KEY=your_public_revenuecat_sdk_key
```

Only public client configuration may use `EXPO_PUBLIC_*`. Never place database credentials, OpenAI keys, RevenueCat secret API keys, webhook tokens, or authentication secrets in the mobile environment.

Production EAS builds load the `production` environment. The production API is:

```text
https://adaptiveskills-api-236264514374.asia-south1.run.app
```

Production builds fail when `EXPO_PUBLIC_API_URL` is missing. Development emulator fallbacks are guarded by `__DEV__` and are not included in release bundles.

## Run locally

Start PostgreSQL and the API from the repository root:

```powershell
docker compose up -d --wait postgres
npm run db:migrate
npm start
```

Then start Expo:

```powershell
npm run mobile:start
```

- Press `a` for Android.
- Press `i` for iOS on macOS.
- Android emulator API: `http://10.0.2.2:3000`.
- iOS simulator API: `http://127.0.0.1:3000`.
- Physical devices require a LAN-accessible development API or deployed HTTPS API.

## Android builds

Run EAS from this directory so it loads `apps/mobile/eas.json`:

```powershell
cd apps/mobile
npx --yes eas-cli@latest build --platform android --profile production-apk
```

The hackathon Test Store APK uses the separate `hackathon-apk` profile:

```powershell
npx --yes eas-cli@latest build --platform android --profile hackathon-apk
```

The judge-ready hackathon APK is [available on EAS](https://expo.dev/accounts/adaptive-labs/projects/adaptive-skills/builds/39f3c608-2651-45e3-a1ba-4dc414c9061b).

## iPhone and iPad builds

An iOS build requires Apple signing credentials. EAS can build a physical-device preview from Windows:

```powershell
cd apps/mobile
npx --yes eas-cli@latest build --platform ios --profile ios-preview
```

The `ios-simulator` profile produces a simulator build that must be installed and tested on macOS. Local native iOS builds also require macOS and Xcode:

```bash
npm run ios --workspace @adaptive-labs/mobile
```

Apple Developer registration, device provisioning, and App Store Connect submission are external account steps and are not stored in this repository.

## Verification

From the repository root:

```powershell
npm run mobile:typecheck
npm run mobile:test
```

The app stores native sessions with Expo SecureStore and always restores progression from the backend. A learner can use the same account and state in the web workspace.
