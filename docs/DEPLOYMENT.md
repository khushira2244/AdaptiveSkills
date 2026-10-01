# Deployment

AdaptiveSkills deploys one backend, one static web workspace, and native clients that share the backend-owned learner state.

## Production inventory

| Component | Target |
| --- | --- |
| API | Cloud Run service `adaptiveskills-api`, region `asia-south1` |
| API URL | `https://adaptiveskills-api-236264514374.asia-south1.run.app` |
| Database | Cloud SQL for PostgreSQL |
| Web | Vercel at `https://adaptive-skills-web-na4j.vercel.app` |
| Native | Expo EAS |
| Hackathon commerce | RevenueCat Test Store |

## Environment boundaries

Mobile may contain only `EXPO_PUBLIC_API_URL` and the public `EXPO_PUBLIC_REVENUECAT_API_KEY`. Web may contain only `VITE_API_URL`. Server values such as `DATABASE_URL`, `AUTH_SECRET`, `OPENAI_API_KEY`, `REVENUECAT_SECRET_API_KEY`, and `REVENUECAT_WEBHOOK_AUTH_TOKEN` belong in Google Secret Manager.

Cloud Run also needs the configured RevenueCat identifiers, OpenAI model settings, `WEB_ORIGINS`, and any resume storage configuration. Use `.env.example` as the variable contract and never copy real secret values into documentation or a client environment.

## Cloud Run and Cloud SQL

Source deployments must run from the repository root so the npm workspaces and lockfile are included:

```powershell
gcloud run deploy adaptiveskills-api --source . --project intentbridge --region asia-south1 --allow-unauthenticated --add-cloudsql-instances intentbridge:asia-south1:adaptiveskills-postgres
```

The service listens on Cloud Run's `PORT`. `DATABASE_URL` can use the attached Cloud SQL Unix socket. The revision service account needs Secret Manager Secret Accessor on every referenced secret and Cloud SQL Client on the instance.

Run production migrations through the existing one-off job:

```powershell
gcloud run jobs execute adaptiveskills-migrate --project intentbridge --region asia-south1 --wait
```

The job uses the same Cloud SQL attachment and `DATABASE_URL`, then runs `npm run db:migrate`. Review job output before sending traffic to a schema-dependent revision.

Set `WEB_ORIGINS` to the exact allowed HTTPS Vercel origins. After deployment:

```powershell
Invoke-RestMethod https://adaptiveskills-api-236264514374.asia-south1.run.app/health
```

## Vercel

Import the repository root. Root `vercel.json` defines `npm run web:build`, output `apps/web/dist`, SPA routing, and response headers. Configure:

```text
VITE_API_URL=https://adaptiveskills-api-236264514374.asia-south1.run.app
```

## Android and iOS

Run EAS from `apps/mobile`:

```powershell
cd apps/mobile
npx --yes eas-cli@latest build --platform android --profile hackathon-apk
npx --yes eas-cli@latest build --platform android --profile production-apk
npx --yes eas-cli@latest build --platform ios --profile ios-preview
```

Use `hackathon-apk` for the RevenueCat Test Store demonstration. It is an installable debug build that still uses the EAS production environment. Keep `production-apk` unchanged for the release APK path. iOS device builds require Apple signing and provisioning; simulator installation and local Xcode checks require macOS.
