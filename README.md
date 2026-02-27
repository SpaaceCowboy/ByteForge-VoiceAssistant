# NeuroSpine Voice Assistant

AI-powered phone assistant for the NeuroSpine Institute — handles incoming calls via Twilio, transcribes speech with Deepgram, manages appointments through OpenAI function calling, and responds with text-to-speech.

Built with Express.js, TypeScript, PostgreSQL, and Upstash Redis.

## Architecture

```
Phone Call → Twilio → WebSocket Media Stream
                              ↓
                   Deepgram (Speech-to-Text)
                              ↓
                    Conversation Service
                       ↙           ↘
               OpenAI GPT-4o       PostgreSQL
           (Function Calling)     (Patients, Appointments,
                       ↘          Doctors, Departments)
                  TTS (OpenAI / ElevenLabs)
                              ↓
                     Audio → Twilio → Caller
```

## Project Structure

```
ByteForge-VoiceAssistant/
├── src/
│   ├── config/
│   │   ├── database.ts        # PostgreSQL connection pool (pg)
│   │   └── redis.ts           # Upstash Redis (REST client)
│   ├── functions/
│   │   └── tools.ts           # OpenAI tool definitions + system prompt
│   ├── middleware/
│   │   ├── auth.ts            # JWT authentication + role-based access
│   │   ├── twilioAuth.ts      # Twilio webhook signature validation
│   │   ├── validate.ts        # Zod request validation schemas
│   │   └── index.ts
│   ├── models/
│   │   ├── patient.ts         # Patient CRUD + history
│   │   ├── appointment.ts     # Appointment scheduling + availability
│   │   ├── callLog.ts         # Call logging + analytics
│   │   ├── faq.ts             # FAQ lookup
│   │   └── index.ts
│   ├── routes/
│   │   ├── twilio.ts          # Twilio webhooks + WebSocket media stream
│   │   ├── api.ts             # REST API (appointments, patients, analytics)
│   │   ├── auth.ts            # JWT login, register, setup
│   │   └── index.ts
│   ├── services/
│   │   ├── conversation.ts    # Main orchestrator (call flow + function execution)
│   │   ├── openai.ts          # LLM chat completions + analysis
│   │   ├── deepgram.ts        # Live speech-to-text
│   │   ├── tts.ts             # Text-to-speech (OpenAI / ElevenLabs)
│   │   └── index.ts
│   ├── utils/
│   │   ├── helpers.ts         # Date/time parsing utilities
│   │   └── logger.ts          # Structured logging
│   └── server.ts              # Entry point
├── types/
│   └── index.ts               # TypeScript type definitions
├── migrations/
│   ├── 002_neurospine_clinic.sql   # Database schema
│   └── seed_001_mock_data.sql      # Sample data
├── package.json
└── tsconfig.json
```

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Twilio account with a phone number
- Deepgram API key
- OpenAI API key
- Upstash Redis instance (REST API)
- (Optional) ElevenLabs API key for alternative TTS

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Required variables:

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/neurospine
UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=+1234567890
DEEPGRAM_API_KEY=your-deepgram-key
OPENAI_API_KEY=your-openai-key
JWT_SECRET=your-jwt-secret
```

### 3. Set Up Database

```bash
createdb neurospine
psql -d neurospine -f migrations/002_neurospine_clinic.sql
psql -d neurospine -f migrations/seed_001_mock_data.sql  # optional
```

### 4. Start Development Server

```bash
npm run dev
```

### 5. Expose with ngrok (for Twilio webhooks)

```bash
ngrok http 3000
```

### 6. Configure Twilio

1. Go to Twilio Console > Phone Numbers
2. Select your phone number
3. Set Voice Configuration:
   - **A Call Comes In**: Webhook
   - **URL**: `https://your-ngrok-url/twilio/voice`
   - **Method**: POST
4. Set Status Callback:
   - **URL**: `https://your-ngrok-url/twilio/status`

## Scripts

```bash
npm run dev        # Hot-reload dev server (ts-node-dev)
npm run build      # Compile TypeScript to dist/
npm start          # Build + run production server
npm run typecheck  # Type check only (tsc --noEmit)
npm run lint       # ESLint
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL | Yes |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token | Yes |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID | Yes |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token | Yes |
| `TWILIO_PHONE_NUMBER` | Your Twilio phone number | Yes |
| `DEEPGRAM_API_KEY` | Deepgram API key | Yes |
| `OPENAI_API_KEY` | OpenAI API key | Yes |
| `JWT_SECRET` | Secret for JWT signing (required in production) | Yes |
| `PORT` | Server port (default: 3000) | No |
| `OPENAI_MODEL` | OpenAI model (default: gpt-4o) | No |
| `TTS_PROVIDER` | `openai` or `elevenlabs` (default: openai) | No |
| `OPENAI_TTS_VOICE` | Voice for OpenAI TTS | No |
| `ELEVENLABS_API_KEY` | ElevenLabs API key | No |
| `BUSINESS_NAME` | Clinic name | No |
| `BUSINESS_TIMEZONE` | Timezone (default: America/Los_Angeles) | No |
| `SKIP_TWILIO_VALIDATION` | Skip webhook signature check in dev | No |
| `TRANSFER_NUMBER` | Number to transfer calls to staff | No |
| `LOG_LEVEL` | Logging level | No |

## Authentication

Two separate auth systems:

**Dashboard API** — JWT Bearer tokens with role-based access (`user` | `moderator`):
- `POST /auth/setup` — One-time first moderator creation (locks after first use)
- `POST /auth/login` — Email + password returns JWT
- `POST /auth/register` — Create new user (moderator-only)
- `GET /auth/me` — Current user profile

**Twilio Webhooks** — HMAC-SHA1 signature validation (skip with `SKIP_TWILIO_VALIDATION=true` in dev)

## API Endpoints

All `/api` routes require a valid JWT Bearer token.

### Health
- `GET /api/health` — Server health check (public)

### Appointments
- `GET /api/appointments?date=YYYY-MM-DD` — List appointments by date
- `GET /api/appointments/:id` — Get appointment details
- `PATCH /api/appointments/:id` — Update appointment
- `DELETE /api/appointments/:id` — Cancel appointment

### Patients
- `GET /api/patients/search?q=query` — Search patients by name/phone
- `GET /api/patients/:id` — Get patient with appointment history
- `PATCH /api/patients/:id` — Update patient info (moderator)

### Call Logs
- `GET /api/calls` — List recent calls
- `GET /api/calls/:callSid` — Get call details

### Analytics
- `GET /api/analytics/overview` — Call and appointment stats
- `GET /api/analytics/intents` — Intent breakdown
- `GET /api/analytics/hourly` — Hourly call distribution

### FAQs
- `GET /api/faqs` — List FAQs (filterable by category)
- `GET /api/faqs/categories` — List FAQ categories
- `POST /api/faqs` — Create FAQ (moderator)
- `PATCH /api/faqs/:id` — Update FAQ (moderator)
- `DELETE /api/faqs/:id` — Deactivate FAQ (moderator)

## AI Function Calling

During a phone call, the AI can invoke these tools:

| Function | Description |
|----------|-------------|
| `check_availability` | Check if a date/time/doctor slot is available |
| `book_appointment` | Book a new appointment |
| `reschedule_appointment` | Reschedule an existing appointment |
| `cancel_appointment` | Cancel an appointment |
| `get_patient_appointments` | List patient's upcoming appointments |
| `update_patient_info` | Update patient name, insurance, or email |
| `get_department_info` | Get department details, doctors, and services |
| `answer_faq` | Look up clinic FAQ answers |
| `transfer_to_staff` | Transfer call to a human staff member |
| `end_call` | End the conversation |

## WebSocket vs Simple Mode

**WebSocket Mode** (`/twilio/voice`) — Recommended
- Lowest latency, real-time bidirectional audio
- Uses Twilio media streams + Deepgram live transcription

**Simple Mode** (`/twilio/voice-simple`)
- Higher latency but simpler setup
- Uses Twilio's built-in Gather verb with Polly TTS

## Database Schema

Key tables (PostgreSQL):

- `patients` — Patient contact info, insurance, preferences
- `appointments` — Scheduling records with confirmation codes
- `doctors` — Provider profiles with specialties
- `departments` — Clinical departments (Neurosurgery, Neurology, etc.)
- `locations` — Clinic locations (Palmdale, Sherman Oaks, Valencia, Thousand Oaks)
- `doctor_locations` — Doctor-location availability mapping
- `call_logs` — Call history, transcripts, sentiment analysis
- `faq_responses` — Pre-defined Q&A for the AI
- `conversation_sessions` — Session state backup
- `blocked_times` — Unavailable time slots
- `dashboard_users` — Admin dashboard accounts

## Security

- Parameterized SQL queries (no ORM, no string interpolation)
- Twilio webhook signature validation (HMAC-SHA1)
- JWT authentication with role-based access control
- Helmet middleware for HTTP security headers
- Rate limiting on API routes
- CORS configuration
- Zod schema validation on all request inputs
- bcryptjs password hashing (12 rounds)

## Production Deployment

```bash
npm run build
pm2 start dist/server.js --name neurospine-voice
```

Ensure:
- SSL/TLS is configured (required by Twilio)
- All required environment variables are set
- `JWT_SECRET` is a strong random secret
- `SKIP_TWILIO_VALIDATION` is **not** set

## License

MIT
