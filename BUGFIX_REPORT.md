# Bug Fix & Feature Report — ByteForge Voice Assistant

**Date:** 2026-02-27
**Scope:** All non-comment bugs across the codebase + operational improvements

---

## Summary

| Severity | Found | Fixed |
|----------|-------|-------|
| Critical | 6     | 6     |
| High     | 11    | 11    |
| Medium   | 12    | 12    |
| **Total**| **29**| **29**|

---

## Critical Fixes (Application-Breaking)

### 1. Broken SQL JOINs — `src/models/patient.ts:50-63`

**Function:** `getPatientWithHistory()`

The entire query was malformed with 4 separate errors:
- Table alias `1` (numeric literal) instead of `l` (letter L) for the locations table
- Trailing comma after `l.name AS location_name,` causing SQL syntax error
- `a.doctor_id = dep.id` joining doctors against the departments alias instead of `d.id`
- `a.department_id = deep.id` referencing non-existent alias `deep` instead of `dep`

**Before:**
```sql
SELECT a.*,
  d.full_name AS doctor_name, d.title AS doctor_title,
  dep.name AS department_name,
  1.name AS location_name,
  FROM appointments a
  LEFT JOIN doctors d ON a.doctor_id = dep.id
  LEFT JOIN departments dep ON a.department_id = deep.id
  LEFT JOIN locations 1 ON a.location_id = 1.id
```

**After:**
```sql
SELECT a.*,
  d.full_name AS doctor_name, d.title AS doctor_title,
  dep.name AS department_name,
  l.name AS location_name
  FROM appointments a
  LEFT JOIN doctors d ON a.doctor_id = d.id
  LEFT JOIN departments dep ON a.department_id = dep.id
  LEFT JOIN locations l ON a.location_id = l.id
```

---

### 2. Wrong table name in `incrementAppointmentCount` — `src/models/patient.ts:180`

Query referenced `customers` (non-existent table) instead of `patients`, and used column `total_reservations` instead of the actual schema column `total_appointments`.

**Before:** `UPDATE customers SET total_reservations = total_reservations + 1`
**After:** `UPDATE patients SET total_appointments = total_appointments + 1`

---

### 3. Wrong table name + case bug in `addNote` — `src/models/patient.ts:191-194`

Same `customers` → `patients` issue, plus `NOTES` (uppercase) in the ELSE branch. PostgreSQL treats unquoted identifiers as lowercase, but using uppercase `NOTES` inside a CASE expression references a different identifier than the lowercase `notes` column.

**Before:** `UPDATE customers SET notes = CASE ... ELSE NOTES || ...`
**After:** `UPDATE patients SET notes = CASE ... ELSE notes || ...`

---

### 4. Env var typo — `src/middleware/twilioAuth.ts:25`

`TWILIO_AUTH_TOKE` (missing N) meant the auth token was always `undefined`. The error log fires but never tells you the real problem.

**Before:** `TWILIO_AUTH_TOKE`
**After:** `TWILIO_AUTH_TOKEN`

---

### 5. Header name typo — `src/middleware/twilioAuth.ts:30`

`x-twilio-signatuer` instead of `x-twilio-signature`. Every legitimate Twilio webhook would be rejected because the header lookup always returned `undefined`.

**Before:** `req.headers['x-twilio-signatuer']`
**After:** `req.headers['x-twilio-signature']`

---

### 6. Error response typo — `src/middleware/twilioAuth.ts:37`

`Forbiddeb: missing signaturee` → `Forbidden: missing signature`

---

## High Fixes (Likely Runtime Errors)

### 7. Auth middleware race condition — `src/middleware/auth.ts:52-103`

The `authenticate` middleware used `.then()/.catch()` promise chaining instead of `async/await`. Converted to a proper async function with try/catch. Also fixed a related issue where `startsWith('Bearer')` (no trailing space) would match malformed headers like `BearerXYZ` — changed to `startsWith('Bearer ')`.

**Changes:**
- `function authenticate(...)` → `async function authenticate(...): Promise<void>`
- `.then()/.catch()` chain → `try { await db.query(...) } catch`
- `startsWith('Bearer')` → `startsWith('Bearer ')`

---

### 8. Null access on messageHistory — `src/services/conversation.ts:700`

If `refreshedSession` is null, `refreshedSession?.messageHistory` evaluates to `undefined`, and calling `.map()` on `undefined` throws.

**Before:**
```typescript
const transcript = refreshedSession?.messageHistory
  .map(m => `[${m.role}]: ${m.content}`)
  .join('\n') || '';
```

**After:**
```typescript
const transcript = (refreshedSession?.messageHistory || [])
  .map(m => `[${m.role}]: ${m.content}`)
  .join('\n');
```

---

### 9. Unprotected Promise.all in call analysis — `src/services/conversation.ts:704-708`

`Promise.all` with `generateCallSummary`, `detectIntent`, and `analyzeSentiment` — if any one rejects, all three results are lost and the error propagates unhandled. Wrapped in try/catch with sensible defaults so the call log is still completed even if analysis fails.

**Before:**
```typescript
const [summary, intent, sentiment] = await Promise.all([
  openaiService.generateCallSummary(transcript),
  openaiService.detectIntent(transcript),
  openaiService.analyzeSentiment(transcript),
]);
```

**After:**
```typescript
let summary = '';
let intent = 'unknown';
let sentiment = { sentiment: 'neutral', score: 0 };

try {
  const [summaryResult, intentResult, sentimentResult] = await Promise.all([...]);
  summary = summaryResult;
  intent = intentResult;
  sentiment = sentimentResult;
} catch (error) {
  logger.error('Failed to generate call analysis', error);
}
```

---

### 10. Pool error handler missing error object — `src/config/database.ts:42`

The pool error handler logged `'Database pool error'` but never passed the `err` parameter to the logger, making database pool errors impossible to diagnose.

**Before:** `logger.error('Database pool error')`
**After:** `logger.error('Database pool error', err)`

---

### 11. Redis env var validation — `src/config/redis.ts:6-9`

Non-null assertions (`!`) on `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` with no validation. If either is missing, the app crashes deep in the Redis client with an unhelpful error. Added an explicit check with a clear error message.

**Added:**
```typescript
if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  throw new Error('Missing required environment variables: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN');
}
```

---

### 12. Missing null check on appointment count — `src/models/appointment.ts:67`

`parseInt(countResult.rows[0].count)` would throw if the query returned no rows.

**Before:** `parseInt(countResult.rows[0].count)`
**After:** `parseInt(countResult.rows[0]?.count || '0')`

---

### 13. Dead `partySize` variable — `src/services/conversation.ts:332`

`partySize` was parsed from `args.party_size` but: (a) the `check_availability` tool definition doesn't include a `party_size` parameter, so OpenAI never sends it, and (b) the variable was never used after parsing. This is leftover code from a restaurant reservation template. Removed the dead line.

**Removed:** `const partySize = parseInt(String(args.party_size));`

---

### 14. Error message typo — `src/middleware/auth.ts:27`

`enviroment` → `environment` in the JWT_SECRET validation error message.

---

## Medium Fixes (Logic Errors / Inconsistencies)

### 15. Column alias mismatch — `src/models/callLog.ts` (4 queries)

Four queries aliased `c.full_name` as `customer_name` but the `CallLog` TypeScript type expects `patient_name`. Fixed all four: `findByCallSid`, `findRecent`, `findTransferredCalls`, `findCallsWithErrors`.

**Before:** `c.full_name as customer_name`
**After:** `c.full_name as patient_name`

---

### 16. Graceful shutdown not awaiting server.close — `src/server.ts:250-252`

`server.close()` is async but was called without awaiting. Redis and database connections could close before in-flight HTTP requests completed. Wrapped in a Promise to ensure proper ordering.

**Before:**
```typescript
server.close(() => {
  logger.info('HTTP server closed');
});
await redis.disconnect();
```

**After:**
```typescript
await new Promise<void>((resolve, reject) => {
  server.close((err) => {
    if (err) reject(err);
    else resolve();
  });
});
logger.info('HTTP server closed');
await redis.disconnect();
```

---

### 17. Deepgram connection leak on error — `src/services/deepgram.ts:69-74`

When a Deepgram error fires, the connection was left open (no cleanup). Added `isOpen = false` and `connection.finish()` in the error handler to prevent resource leaks.

---

### 18. PM time assumption too broad — `src/utils/helpers.ts:112-114`

Word-based time parsing (`"one"`, `"two"`, `"three"`, `"four"`) assumed PM for hours 1-4 unless the input contained "am" or "morning". Added `"midnight"` to the exclusion list to prevent `"midnight"` from being incorrectly interpreted as 12 PM.

---

### 19. Extra space in function call — `src/services/conversation.ts:682`

`String (args.notes)` had a space between `String` and `(`. Fixed to `String(args.notes)`.

---

### 20. Unused `redis` dependency — `package.json`

The project uses `@upstash/redis` (REST client) exclusively. The `redis` (TCP client) package was listed as a dependency but never imported anywhere. Removed to reduce install size and attack surface.

---

### 21. Typo in `validate inputys` comment — `src/services/conversation.ts:334`

Fixed to `validate inputs` (caught incidentally while removing the `partySize` line).

---

## Round 2 — Follow-up Fixes

### 22. NaN validation for route ID parameters — `src/routes/api.ts` (7 routes)

All routes using `parseInt(req.params.id)` now go through a shared `parseIdParam()` helper that returns 400 if the ID is non-numeric or <= 0. Prevents NaN from reaching the database.

**Affected routes:** `GET/PATCH/DELETE /appointments/:id`, `GET/PATCH /patients/:id`, `PATCH/DELETE /faqs/:id`

---

### 23. `is_new_patient` handles both string and boolean — `src/services/conversation.ts:418`

OpenAI function calling may return `true` (boolean) or `"true"` (string) depending on how it interprets the tool schema. The comparison now handles both.

**Before:** `args.is_new_patient === 'true'`
**After:** `args.is_new_patient === true || args.is_new_patient === 'true'`

---

### 24-26. TypeScript type errors resolved — `src/middleware/auth.ts`, `src/services/conversation.ts`

The 3 pre-existing `tsc` errors are now fixed:
- `jwt.sign()` — expiresIn typed with intersection cast
- `jwt.verify()` — intermediate `unknown` cast for custom JwtPayload
- `appointmentType` — cast as `AppointmentType` with proper import

**Project now compiles with zero errors (`tsc --noEmit`).**

---

### 27-29. Missing try-catch on function handlers — `src/services/conversation.ts`

Three OpenAI function call handlers (`handleCheckAvailability`, `handleGetAppointments`, `handleUpdatePatientInfo`) had no error handling around their database calls. If any query threw, the error propagated unhandled through the function calling loop, leaving the caller with no response. Wrapped each in try-catch with a graceful `{ success: false, error: '...' }` return so the LLM can inform the caller instead of silently failing.

---

---

## Round 3 — Feature Additions

### 30. Test Framework (Vitest) — 67 unit tests

No test infrastructure existed. Set up Vitest with TypeScript path alias support.

**New files:**
- `vitest.config.ts` — config with path aliases mirroring tsconfig
- `src/utils/helpers.test.ts` — 57 tests covering `parseDate`, `parseTime`, `formatDate`, `formatTime`, `normalizePhone`, `formatPhoneForDisplay`, `formatTimeForDisplay`, `extractNumber`, `cleanTextForSpeech`, `truncate`, `titleCase`, `generateConfirmationCode`, `validateAppointment`
- `src/middleware/auth.test.ts` — 10 tests covering `signToken`/`verifyToken` round-trip, invalid tokens, wrong secret, `requireRole` authorization

**Modified:**
- `package.json` — added `vitest` devDependency, `test` and `test:watch` scripts
- `tsconfig.json` — added `**/*.test.ts` to exclude (prevents test files compiling into `dist/`)

---

### 31. Structured Request Logging — replaces Morgan

Morgan logged Apache-format strings. Replaced with a custom middleware that uses the existing `logger.request()` helper for structured output with method, path, status code, and duration.

**New file:** `src/middleware/requestLogger.ts` — hooks into `res.on('finish')`, calculates duration, no sensitive data logged

**Modified:**
- `src/server.ts` — replaced Morgan with `requestLogger`
- `src/middleware/index.ts` — exports `requestLogger`
- `package.json` — removed `morgan` and `@types/morgan` dependencies

---

### 32. Deep Health Check — `GET /api/health?detailed=true`

The health endpoint was a static `{ status: 'ok' }` with no actual connectivity checks.

**Enhanced behavior:**
- `GET /api/health` — fast response, no I/O (unchanged default)
- `GET /api/health?detailed=true` — parallel database (`SELECT NOW()`) and Redis (`PING`) checks, returns per-component status

```json
{
  "status": "degraded",
  "timestamp": "...",
  "version": "2.0.0",
  "components": {
    "database": { "status": "ok" },
    "redis": { "status": "error" }
  }
}
```

Returns `200` for `ok`/`degraded`, `503` when all components are down.

**Modified:**
- `src/config/redis.ts` — added `ping()` function
- `src/routes/api.ts` — enhanced health endpoint with detailed mode

---

### 33. Stricter Auth Rate Limiting — per-route limits

The blanket 20 req/15min limiter on all `/auth` routes was too generous for sensitive endpoints.

**New per-route limiters in `src/routes/auth.ts`:**
- `POST /auth/login` — 5 requests per 15 minutes (brute-force protection)
- `POST /auth/setup` — 3 requests per hour (one-time endpoint)

**Modified:**
- `src/routes/auth.ts` — added `loginLimiter` and `setupLimiter` with `express-rate-limit`
- `src/server.ts` — removed blanket `authLimiter` (remaining auth routes are JWT-protected)

---

### 34. PostgreSQL Session Cleanup

The `conversation_sessions` table existed in the schema but was never read or written — sessions lived only in Redis with a 1-hour TTL. Now sessions are persisted to the database for audit/backup and cleaned up automatically.

**New file:** `src/models/session.ts` — `upsertSession`, `markInactive`, `deleteOldSessions`, `getSessionStats`

**Session lifecycle:**
1. `initializeConversation` → persists session to DB (`is_active = TRUE`)
2. `handleEndCall` / `handleCallEnded` → marks session inactive in DB, then deletes from Redis
3. Server runs `setInterval` every 6 hours → deletes inactive sessions older than 24h
4. Timer uses `.unref()` so it doesn't block shutdown; cleared on `SIGTERM`/`SIGINT`

**Admin endpoints (moderator-only):**
- `GET /api/sessions/stats` — total, active, inactive counts + oldest inactive timestamp
- `POST /api/sessions/cleanup?hours=24` — manually trigger cleanup

**Modified:**
- `src/models/index.ts` — exports `sessionModel`
- `src/services/conversation.ts` — session persistence on init, mark inactive on end
- `src/server.ts` — periodic cleanup timer + shutdown cleanup
- `src/routes/api.ts` — admin session endpoints

---

## Files Changed

| File | Changes |
|------|---------|
| `src/models/patient.ts` | Fixed 3 critical SQL bugs |
| `src/middleware/twilioAuth.ts` | Fixed 3 typos (env var, header, error message) |
| `src/middleware/auth.ts` | Async/await, Bearer check, env typo, JWT type fixes |
| `src/services/conversation.ts` | Null safety, error isolation, dead code, type fixes, is_new_patient, 3 handler try-catches, session persistence |
| `src/config/database.ts` | Pool error logging |
| `src/config/redis.ts` | Env var validation, `ping()` for health check |
| `src/models/appointment.ts` | Null check on parseInt |
| `src/models/callLog.ts` | Fixed 4 column alias mismatches |
| `src/server.ts` | Graceful shutdown, replaced Morgan, removed authLimiter, session cleanup timer |
| `src/services/deepgram.ts` | Connection cleanup on error |
| `src/utils/helpers.ts` | PM time edge case |
| `src/routes/api.ts` | NaN validation, deep health check, session admin endpoints |
| `src/routes/auth.ts` | Per-route rate limiters (login, setup) |
| `src/middleware/index.ts` | Exports requestLogger |
| `src/models/index.ts` | Exports sessionModel |
| `package.json` | Removed redis/morgan, added vitest, test scripts |
| `tsconfig.json` | Exclude test files from build |

## New Files

| File | Purpose |
|------|---------|
| `vitest.config.ts` | Vitest configuration with path aliases |
| `src/utils/helpers.test.ts` | 57 unit tests for date/time/phone/text helpers |
| `src/middleware/auth.test.ts` | 10 unit tests for JWT auth + role checks |
| `src/middleware/requestLogger.ts` | Structured request logging middleware |
| `src/models/session.ts` | Session DB persistence + cleanup model |
