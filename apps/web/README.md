# AdaptiveSkills web workspace

The web client is a desktop workspace for the existing AdaptiveSkills product. It uses the same Cloud Run API, bearer sessions, learner records, and backend-owned progression state as mobile.

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

## Vercel

Import the repository with the repository root as Vercel's Root Directory. Use:

- Build command: `npm run web:build`
- Output directory: `apps/web/dist`
- Environment variable: `VITE_API_URL=https://adaptiveskills-api-236264514374.asia-south1.run.app`

Set the deployed HTTPS site origin in the Cloud Run API's comma-separated `WEB_ORIGINS` variable, then deploy a new API revision. Use the exact production and preview origins that need access.
