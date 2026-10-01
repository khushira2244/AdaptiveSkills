# Testing

The counts below come from a fresh repository run on 1 October 2026.

| Suite | Command | Result |
| --- | --- | --- |
| API and shared logic | `npm test` | 42 passed, 0 failed |
| Web | `npm run web:test` | 16 passed, 0 failed |
| Mobile | `npm run mobile:test` | 15 passed, 0 failed |
| Mobile TypeScript | `npm run mobile:typecheck` | passed |
| Web TypeScript | `npm run web:typecheck` | passed |

The API command performs the clean production build order before running the compiled Node test suite. It verifies health, CORS, configuration safety, skill-review compatibility, structured OpenAI reasoning, dependency closure, bounded trial generation, teaching, and lab generation. The web suite covers backend-driven Home actions, unit resume, source context, labs, evidence, My Work, and access display. The mobile suite covers learning/lab navigation, Android Back behavior, RevenueCat package selection, teaching parsing, selection context, and completion gates.

## Full checks

```powershell
npm run typecheck
npm test
npm run mobile:typecheck
npm run mobile:test
npm run web:typecheck
npm run web:test
npm run web:build
git diff --check
```

## Database integration

`npm run test:db` requires a dedicated reachable PostgreSQL database in `DATABASE_URL`. It applies the migration path and exercises persistence, transactions, ownership, commerce, learning, labs, and continuation at the repository boundary. Do not point this command at production. The documentation refresh did not run this suite because a dedicated test database was not provisioned for the run.

## Deployment checks

- Clean Cloud Build: run `npm ci`, remove generated `dist` and `*.tsbuildinfo`, then run `npm run build` and the direct API workspace build.
- Cloud Run: request `GET /health` and confirm HTTP 200.
- Web: verify login, session restore, Home action, teaching, lab autosave, and SPA deep-link reload.
- Native: verify safe areas, keyboard scrolling, Android Back, secure session restore, and the production API URL.
- RevenueCat Test Store: simulate initial and continuation success, cancellation, failure, and restore; confirm only backend-verified success unlocks access.
- Cross-platform: update a note, marker, lesson position, and lab draft on one client, then confirm the same account sees them on another.
