# AdaptiveSkills web workspace

The web client is a desktop workspace for the existing AdaptiveSkills product. It uses the same Cloud Run API, bearer sessions, learner records, and backend-owned progression state as mobile.

**Production:** [adaptive-skills-web-na4j.vercel.app](https://adaptive-skills-web-na4j.vercel.app)

Web expands the learning workspace without creating a second product. A learner can start on Android, iPhone, or iPad and continue on web with the same profile, goal, scope, progress, notes, labs, evidence, access, and continuation state.

## Implemented flows

- Account login/signup and session restore
- Versioned learner onboarding with exact-step resume
- Resume upload, extraction review, confirmation, and skip
- Profile, skills, goal, interests, timeline, and pace
- Entitlement-gated target/JD context
- Backend AI target analysis and learning-scope proposal
- Capability navigation, concept selection, dependency display, confirmation, and unit generation
- Backend `primaryAction` driven Home/resume state
- Teaching reader with saved notes, marked words, and doubt checkpoints
- Desktop lab workspace with editable files, autosave, file-scoped hints, runs, submission, and evidence
- My Work lab history and exact lab resume
- Verified initial and continuation entitlement status, with backend reconciliation for mobile RevenueCat purchases
- Profile, supported learning preferences, and product help

Purchases remain in the native RevenueCat SDK flow. Web Billing shows and reconciles backend-verified access; it does not duplicate mobile purchase logic.

## Local development

From the repository root:

```powershell
Copy-Item apps/web/.env.example apps/web/.env.local
npm run web:dev
```

The local API must allow `http://localhost:5173` through `WEB_ORIGINS`.

## Production build

```powershell
npm run web:build
```

The static output is `apps/web/dist`.

To preview that output locally:

```powershell
npm run preview --workspace @adaptive-labs/web
```

## Vercel

Import the repository with the repository root as Vercel's Root Directory. Use:

- Build command: `npm run web:build`
- Output directory: `apps/web/dist`
- Environment variable: `VITE_API_URL=https://adaptiveskills-api-236264514374.asia-south1.run.app`

Set the deployed HTTPS site origin in the Cloud Run API's comma-separated `WEB_ORIGINS` variable, then deploy a new API revision. Use the exact production and preview origins that need access.

The repository-root `vercel.json` provides the Vite build, SPA rewrite, production API content-security policy, and immutable asset caching. Do not create a second backend service in Vercel.

## Verification

From the repository root:

```powershell
npm run web:typecheck
npm run web:test
npm run web:build
```
