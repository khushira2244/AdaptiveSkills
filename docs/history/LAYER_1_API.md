# Layer 1 API contract

> Historical implementation checkpoint. See the current [backend documentation](../backend.md).

Local base URL: http://127.0.0.1:3000. JSON requests/responses.
Shared schemas: packages/contracts/src/onboarding.ts.

## Identity

| Method | Route | Request | Result |
|---|---|---|---|
| POST | /auth/signup | email, password | 201 session |
| POST | /auth/login | email, password | session |
| POST | /auth/logout | bearer token, empty object | 204, current session revoked |
| GET | /me | bearer token | learner, currentStep, onboardingComplete, productState |

Emails are trimmed/lowercased. Passwords are 12–128 characters and stored with salted scrypt. Session tokens are random 256-bit bearer secrets; only keyed token hashes are stored. They expire after 30 days and survive backend restarts with the same AUTH_SECRET. Login returns a new session for the same learner.

Session response: { token, expiresAt: ISO timestamp, learnerId: UUID }.
Use Authorization: Bearer <token> on every learner request. Persist tokens securely on-device, never in URLs. Use HTTPS outside local development. Identity is never selected from a body/query learnerId.

No social login, email verification, password reset, or refresh flow is implemented. Logout revokes the current session, not all devices.

## Unified state

GET /me/onboarding:

```json
{
  "learnerId": "<UUID>",
  "version": 0,
  "currentStep": "profile",
  "completed": false,
  "profile": { "displayName": null, "currentRole": null, "experienceYears": null },
  "resume": null,
  "skills": [],
  "goal": null,
  "interests": [],
  "preferences": { "timelineDays": null, "pace": null },
  "nextRoute": "ONBOARDING"
}
```

All successful section writes, advancement, and completion return this full state with its new version.

## Save endpoints

Every mutation includes the latest version. Saving a draft does not advance its step.

| Method | Route | Body fields in addition to version |
|---|---|---|
| PATCH | /me/profile | profile: any subset of displayName, currentRole, experienceYears |
| GET | /me/skills | no body; returns skills array |
| PUT | /me/skills | skills: full replacement array |
| PUT | /me/goal | goal: { target, reason } |
| PUT | /me/interests | interests: string array |
| PUT | /me/preferences | preferences: { timelineDays, pace } |
| POST | /me/resume | filename, mimeType, contentBase64 |
| POST | /me/resume/confirm | resumeId, skillNames |

Partial skills example:

```json
{
  "version": 7,
  "skills": [{
    "name": "Distributed cache tuning",
    "level": "WORKING",
    "subskills": [{ "name": "Eviction policies", "level": null }]
  }]
}
```

Names are learner-defined. Levels are AWARE, WORKING, PRODUCTION, DEEP, or null while drafting. They are self-assessments, not proven capability. Beginners can submit an empty list. Limits: 100 skills, 30 subskills per skill; duplicate names are rejected case-insensitively.

Profile values can be null while drafting. Experience accepts zero/fractional years up to 80. Goal target is free text, up to 3000 characters, and reason is nullable. Interests can be empty. Timeline is 1–3650 days; pace is CASUAL, STEADY, or INTENSIVE, both nullable while drafting.

PUT replaces a section. PATCH changes supplied profile fields only. Unknown fields are rejected. Wait for each save and use its returned version. On 409 STALE_VERSION, fetch fresh state and reconcile; do not overwrite it by retrying stale content.

## Progression

Server-owned order:

```text
profile → role → experience → resume → skills → goal
→ interests → preferences → review → complete
```

POST /me/onboarding/advance accepts { version, step }. The step must equal currentStep. Required fields are checked. Resume and interests can be skipped through explicit advancement. Skills may be empty, but listed skills/subskills need levels before leaving that step.

POST /me/onboarding/complete accepts { version }. Requires review and valid required fields. Completion, timestamp and step commit atomically. Repeated completion is idempotent. Completed onboarding rejects section edits; later profile/settings editing is outside this layer.

After completion: completed=true, currentStep=complete, nextRoute=UNPAID_HOME. /me returns the same productState. This is a destination, not a payment/entitlement decision.

React Native integration:

1. Signup/login and store the token securely.
2. Fetch /me/onboarding and render currentStep.
3. Save drafts with version; retain the returned state.
4. On Continue, await outstanding saves, then advance.
5. On relaunch, fetch state with the stored token. If expired, log in again.
6. Complete from review and route to unpaid Home.

The backend preserves acknowledged saves. Unsaved keystrokes require a client pending-edit queue. It does not reconstruct data never sent to it.

## Optional CV

Accept PDF, DOCX or UTF-8 TXT, up to 2 MiB decoded. Send base64 JSON and the matching MIME type:
application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, or text/plain.

PDF extraction covers the first 20 pages; there is no OCR. Unreadable/encrypted/scanned files may have no suggestions or return 422. The learner can skip CV and type their details.

Parsing uses a separate process, a timeout and a bounded JS heap. Private file storage uses generated keys, not user-provided paths. Files are not exposed as public URLs.

resume returns { resumeId, filename, mimeType, suggestions, confirmed }. Extraction is a conservative skill-keyword matcher, not an AI profile interpretation. Upload alone never mutates profile or skills. Confirmation adds only selected suggestions with null self-assessment, preserving existing skills. Custom skills can be added independently.

Replacing a CV replaces the reference and removes the previous local file after commit. A rejected/stale upload does not change saved state.

## Errors and limits

All errors use { error: { code, message, requestId } }.

- 400 INVALID_INPUT: invalid or unknown fields.
- 401 UNAUTHORIZED: missing/invalid/expired/revoked session.
- 404 NOT_FOUND: missing owned resource.
- 409: STALE_VERSION, INVALID_STEP, ONBOARDING_COMPLETE, ACCOUNT_EXISTS.
- 413: oversized body/CV.
- 422: INCOMPLETE_STEP, INCOMPLETE_ONBOARDING, INVALID_SUGGESTION, CV_UNREADABLE.
- 429: rate limit or authentication capacity limit.
- 500: safe generic message.

Auth routes share 10 requests/minute/IP. CV uploads allow 5/minute/IP. Other learner requests allow 120/minute/IP. Limits are in-process for the single API service; proxy trust is disabled. Learner responses use Cache-Control: no-store.

## Acceptance boundary

Backend tests verify save → reload → restore → continue → finish. A real server-process restart also restores the same authenticated partial skills draft. Actual React Native screen/device verification is still required before accepting the complete Layer 1 vertical slice.
