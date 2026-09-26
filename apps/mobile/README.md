# AdaptiveSkills mobile

This is the native Expo/React Native client for the Layer 1 learner onboarding flow. It uses the backend as the source of truth and restores the exact saved onboarding step after an app restart.

## Run locally

From the repository root:

```powershell
docker compose up -d postgres
npm run db:migrate
npm run build
npm start
```

In a second terminal:

```powershell
npm install
npm run mobile:start
```

Press `a` in Expo for an Android emulator. The default Android API URL is `http://10.0.2.2:3000`. An iOS simulator uses `http://127.0.0.1:3000`.

For a physical phone, start the API on a LAN-accessible host, set `EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:3000` in `apps/mobile/.env`, and ensure the phone and computer are on the same network.

## Layer 1 behavior

- Session tokens are stored with Expo SecureStore.
- Every continue action saves to PostgreSQL before advancing.
- Startup fetches `GET /me/onboarding` and opens the backend-owned current step.
- CV suggestions require explicit learner confirmation.
- A stale version reloads current server state instead of overwriting it.
- Completion routes to the unpaid Home placeholder.
