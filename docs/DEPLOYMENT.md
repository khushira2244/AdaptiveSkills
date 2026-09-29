# AdaptiveSkills deployment guide

AdaptiveSkills is one product delivered through three clients. Android, iPhone/iPad, and web call the same Fastify API and resume the same PostgreSQL-backed learner state.

## Production inventory

| Component | Production target |
| --- | --- |
| Android | Expo EAS internal-distribution APK |
| iPhone/iPad | Expo/EAS iOS client; Apple signing is required for device distribution |
| Web | Vercel static Vite application |
| API | Google Cloud Run: `adaptiveskills-api` in `asia-south1` |
| Database | Cloud SQL for PostgreSQL |
| Access | RevenueCat Test Store for the hackathon build |

Production API:

```text
https://adaptiveskills-api-236264514374.asia-south1.run.app
```

Production web app:

```text
https://adaptive-skills-web-na4j.vercel.app
```

## Environment boundaries

### Native public configuration

Configured in the EAS `production` environment:

```text
EXPO_PUBLIC_API_URL
EXPO_PUBLIC_REVENUECAT_API_KEY
```

These values are bundled into the app and must remain safe for clients.

### Web public configuration

Configured in Vercel:

```text
VITE_API_URL
```

### API server configuration

Cloud Run owns database, authentication, OpenAI, RevenueCat server, webhook, model, and CORS configuration. Secret values must come from Secret Manager and must never use `EXPO_PUBLIC_*` or `VITE_*` names.

See [`.env.example`](../.env.example) for the complete variable contract without real credentials.

## Android APK

Run the build from `apps/mobile`, where the EAS profiles live:

```powershell
cd apps/mobile
npx --yes eas-cli@latest build --platform android --profile production-apk
```

The `production-apk` profile uses the EAS `production` environment and emits an installable APK. The final verified build is:

```text
01250f6f-c016-4629-8b17-e7112160f49c
```

Build page: [Expo EAS](https://expo.dev/accounts/adaptive-labs/projects/adaptive-skills/builds/01250f6f-c016-4629-8b17-e7112160f49c)

## iPhone and iPad

The Expo configuration uses bundle ID `com.adaptivelabs.adaptiveskills`, enables iPad support, keeps iPhone in portrait, and allows iPad portrait and landscape orientations.

For an EAS device preview:

```powershell
cd apps/mobile
npx --yes eas-cli@latest build --platform ios --profile ios-preview
```

For an iOS simulator build:

```powershell
cd apps/mobile
npx --yes eas-cli@latest build --platform ios --profile ios-simulator
```

Installing a simulator build and running local Xcode validation require macOS. Physical-device distribution requires Apple signing credentials and registered device provisioning.

## Web and Vercel

Build from the repository root:

```powershell
npm run web:build
```

Vercel settings:

| Setting | Value |
| --- | --- |
| Root Directory | Repository root |
| Framework | Vite |
| Build command | `npm run web:build` |
| Output directory | `apps/web/dist` |
| Environment | `VITE_API_URL=https://adaptiveskills-api-236264514374.asia-south1.run.app` |

The root [`vercel.json`](../vercel.json) provides SPA routing and security headers. Cloud Run `WEB_ORIGINS` must contain each exact deployed Vercel origin that is allowed to call authenticated API routes.

## API and database

The Cloud Run source deployment starts from the repository root because the root build orders shared packages before the API:

```text
contracts → domain → db → api
```

Cloud Run must attach the existing Cloud SQL instance and inject server secrets from Secret Manager. Production migrations run through the dedicated migration job using:

```powershell
npm run db:migrate
```

Do not run migrations from a mobile or web client.

## Release verification

```powershell
npm run typecheck
npm test
npm run test:db
npm run mobile:typecheck
npm run mobile:test
npm run web:typecheck
npm run web:test
npm run web:build
```

Before distributing a native build, confirm its bundle contains the production Cloud Run URL and does not contain emulator API URLs or server secrets. Before promoting web, confirm login, session restore, `/home`, teaching, labs, and saved state work with the same account used on mobile.
