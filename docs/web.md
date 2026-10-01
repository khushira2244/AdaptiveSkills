# Web

`apps/web` is a React and Vite workspace for the same AdaptiveSkills product. It uses the production Fastify API and shared learner state; it is not a separate course system or backend.

## Workspace

The desktop layout provides a persistent sidebar, top header, wide main area, and responsive contextual panels. It reduces to a collapsible and then single-column layout for tablets and narrow browsers without recreating the native bottom navigation.

Authenticated routes cover:

- Home and its backend-provided primary action;
- Learn, units, persistent teaching, notes, markers, and doubts;
- Saved Notes and Marked Words with source links;
- labs and the desktop lab workspace;
- My Work, submissions, and evidence;
- Billing and RevenueCat access reconciliation;
- You, Settings, and Help & Support.

Login, onboarding, resume upload, skill review, goal/JD context, scope selection, Home, teaching, labs, and continuation all call the existing API. The browser does not recompute access or progression.

## Vercel

Production is [adaptive-skills-web-na4j.vercel.app](https://adaptive-skills-web-na4j.vercel.app). Import the repository root and use:

| Setting | Value |
| --- | --- |
| Framework | Vite |
| Build command | `npm run web:build` |
| Output directory | `apps/web/dist` |
| Public environment | `VITE_API_URL=https://adaptiveskills-api-236264514374.asia-south1.run.app` |

Root `vercel.json` supplies the SPA rewrite, CSP, and asset caching. Cloud Run `WEB_ORIGINS` must include the exact deployed origin. Only `VITE_API_URL` is exposed to the browser; backend secrets stay in Google Secret Manager.

Local development:

```powershell
Copy-Item apps/web/.env.example apps/web/.env.local
npm run web:dev
```
