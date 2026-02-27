# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered voice assistant for a medical clinic (NeuroSpine Institute). Handles incoming phone calls via Twilio, transcribes speech with Deepgram, uses OpenAI (gpt-4o) with function calling for conversational appointment management, and responds with text-to-speech.

**Stack**: Express.js + TypeScript, PostgreSQL (raw SQL via `pg`), Upstash Redis, Twilio, Deepgram, OpenAI

## Commands

```bash
npm run dev          # Hot-reload dev server (ts-node-dev)
npm run build        # Compile TypeScript to dist/
npm start            # Build + run dist/server.js
npm run lint         # ESLint on src/**/*.ts
npm run typecheck    # tsc --noEmit
```

No test framework is configured yet.

## Architecture

### Call Flow

```
Phone Call → Twilio webhook → WebSocket media stream
  → Deepgram (speech-to-text) → Conversation Service
  → OpenAI (LLM + function calling) → Database operations
  → TTS (OpenAI or ElevenLabs) → Audio back to Twilio → Caller
```

### Layer Separation

- **`src/config/`** — Database pool (`pg`), Redis client (Upstash REST)
- **`src/functions/tools.ts`** — OpenAI function calling tool definitions (check_availability, book_appointment, modify_appointment, cancel_appointment, etc.)
- **`src/middleware/`** — JWT auth, Twilio webhook signature validation, Zod request validation schemas
- **`src/models/`** — Data access layer with raw parameterized SQL queries (patient, appointment, callLog, faq)
- **`src/routes/`** — HTTP endpoints: `twilio.ts` (webhooks + WebSocket), `api.ts` (REST CRUD), `auth.ts` (JWT login/register)
- **`src/services/`** — Business logic: `conversation.ts` (orchestrator), `openai.ts` (LLM), `deepgram.ts` (STT), `tts.ts` (TTS)
- **`src/utils/`** — Date/time helpers, structured logger
- **`types/index.ts`** — All TypeScript type definitions (~650 lines)

### Key Design Decisions

- **Raw SQL over Prisma**: Uses `pg` library directly with parameterized queries. Models are hand-written SQL, not ORM-generated.
- **Upstash Redis (REST API)**: Serverless Redis for session state — no TCP connections. Sessions keyed by `session:{callSid}` with 1-hour TTL.
- **WebSocket media streams**: Low-latency audio path between Twilio and the server (alternative simple Gather mode also available at `/twilio/voice-simple`).
- **OpenAI function calling**: The LLM decides when to invoke tools like booking or checking availability. Tool definitions in `src/functions/tools.ts`, execution logic in `src/services/conversation.ts`.

### Authentication

Two separate auth systems:
1. **Dashboard API**: JWT Bearer tokens with roles (`user` | `moderator`). First moderator created via one-time `POST /auth/setup`.
2. **Twilio webhooks**: HMAC-SHA1 signature validation (skippable via `SKIP_TWILIO_VALIDATION` in dev).

### Database Schema

PostgreSQL with migrations in `migrations/`. Key tables: `locations`, `departments`, `doctors`, `doctor_locations`, `patients`, `appointments`, `call_logs`, `faq_responses`, `conversation_sessions`, `blocked_times`. Run migrations with `psql`.

## TypeScript Configuration

- Target ES2022, CommonJS modules, strict mode
- Path aliases: `@config/*`, `@services/*`, `@models/*`, `@routes/*`, `@utils/*`, `@types/*` (baseUrl is `./src`)
- Output to `dist/` with source maps and declarations

## Environment Variables

Required in `.env`: `DATABASE_URL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `OPENAI_API_KEY`, `DEEPGRAM_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `JWT_SECRET`

Optional: `OPENAI_MODEL` (default gpt-4o), `TTS_PROVIDER` (openai|elevenlabs), `OPENAI_TTS_VOICE`, `ELEVENLABS_API_KEY`, `BUSINESS_NAME`, `BUSINESS_TIMEZONE`, `SKIP_TWILIO_VALIDATION`, `TRANSFER_NUMBER`, `LOG_LEVEL`
