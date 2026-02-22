# SpineWell Clinic - AI Voice Assistant

AI-powered phone assistant for SpineWell Clinic that handles appointment scheduling, patient inquiries, and clinic information via voice calls using Twilio, Deepgram, and OpenAI.

## Architecture

```
Phone Call → Twilio → WebSocket
                         ↓
              Deepgram (Speech-to-Text)
                         ↓
              Conversation Service
                    ↙       ↘
            OpenAI           Database
        (Function Calling)   (PostgreSQL)
                    ↘       ↙
                TTS (OpenAI/ElevenLabs)
                         ↓
                      Twilio
                         ↓
                      Caller
```

## Project Structure

```
src/
├── config/
│   ├── database.ts    # PostgreSQL connection pool (Supabase)
│   └── redis.ts       # Redis session management (Upstash)
├── functions/
│   └── tools.ts       # OpenAI function definitions & system prompt
├── models/
│   ├── patient.ts     # Patient CRUD operations
│   ├── appointment.ts # Appointment management
│   ├── callLog.ts     # Call logging & analytics
│   ├── faq.ts         # FAQ lookup
│   └── index.ts
├── routes/
│   ├── twilio.ts      # Twilio webhooks & WebSocket
│   ├── api.ts         # REST API endpoints
│   └── index.ts
├── services/
│   ├── conversation.ts # Main orchestrator
│   ├── openai.ts      # LLM integration
│   ├── deepgram.ts    # Speech-to-text
│   ├── tts.ts         # Text-to-speech
│   └── index.ts
├── utils/
│   ├── helpers.ts     # Utility functions
│   └── logger.ts      # Logging
└── server.ts          # Entry point
types/
└── index.ts           # TypeScript definitions
migrations/
└── 001_initial.sql    # Database schema
```

## Prerequisites

- Node.js 18+
- PostgreSQL 14+ (Supabase)
- Redis 6+ (Upstash)
- Twilio Account
- Deepgram API Key
- OpenAI API Key
- (Optional) ElevenLabs API Key

## Quick Start

### 1. Clone and Install

```bash
git clone <repo>
cd ByteForge-VoiceAssistant
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API keys
```

### 3. Set Up Database

```bash
# Run migrations against your Supabase PostgreSQL
psql -d <database_url> -f migrations/001_initial.sql
```

### 4. Run Development Server

```bash
npm run dev
```

### 5. Expose with ngrok (for Twilio)

```bash
ngrok http 3000
```

### 6. Configure Twilio

1. Go to Twilio Console → Phone Numbers
2. Select your phone number
3. Set Voice Configuration:
   - **A Call Comes In**: Webhook
   - **URL**: `https://your-ngrok-url/twilio/voice`
   - **Method**: POST
4. Set Status Callback:
   - **URL**: `https://your-ngrok-url/twilio/status`

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 3000) | No |
| `DATABASE_URL` | PostgreSQL connection string (Supabase) | Yes |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL | Yes |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token | Yes |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID | Yes |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token | Yes |
| `TWILIO_PHONE_NUMBER` | Your Twilio phone number | Yes |
| `DEEPGRAM_API_KEY` | Deepgram API key | Yes |
| `OPENAI_API_KEY` | OpenAI API key | Yes |
| `OPENAI_MODEL` | OpenAI model (default: gpt-4o) | No |
| `TTS_PROVIDER` | 'openai' or 'elevenlabs' | No |
| `OPENAI_TTS_VOICE` | Voice for OpenAI TTS | No |
| `ELEVENLABS_API_KEY` | ElevenLabs API key | No |
| `BUSINESS_NAME` | Clinic name (default: SpineWell Clinic) | Yes |
| `BUSINESS_OPENING_HOUR` | Opening time, HH:MM (default: 08:00) | No |
| `BUSINESS_CLOSING_HOUR` | Closing time, HH:MM (default: 17:00) | No |
| `MAX_APPOINTMENTS_PER_SLOT` | Max concurrent appointments (default: 3) | No |
| `TRANSFER_NUMBER` | Number to transfer calls to staff | No |

## API Endpoints

### Health & Status
- `GET /` - Server info
- `GET /api/health` - Health check

### Appointments
- `GET /api/appointments` - List appointments (filter by date)
- `GET /api/appointments/:id` - Get appointment details
- `PATCH /api/appointments/:id` - Update appointment
- `DELETE /api/appointments/:id` - Cancel appointment

### Patients
- `GET /api/patients/search?q=query` - Search patients
- `GET /api/patients/:id` - Get patient with history

### Call Logs
- `GET /api/calls` - List calls (filter by date range)
- `GET /api/calls/:callSid` - Get call details with transcript

### Analytics
- `GET /api/analytics/overview` - Call & appointment stats
- `GET /api/analytics/intents` - Intent breakdown
- `GET /api/analytics/hourly` - Hourly call distribution

### FAQs
- `GET /api/faqs` - List FAQs
- `POST /api/faqs` - Create FAQ
- `PATCH /api/faqs/:id` - Update FAQ
- `DELETE /api/faqs/:id` - Deactivate FAQ

## Available Scripts

```bash
npm run dev       # Development with hot reload
npm run build     # Compile TypeScript
npm start         # Run compiled code
npm run typecheck # Type checking only
npm run lint      # Run ESLint
```

## AI Function Calling

The AI can perform these actions during a call:

| Function | Description |
|----------|-------------|
| `check_availability` | Check if appointment slot is available |
| `book_appointment` | Schedule a new appointment |
| `reschedule_appointment` | Change an existing appointment |
| `cancel_appointment` | Cancel an appointment |
| `get_patient_appointments` | List patient's upcoming appointments |
| `update_patient_name` | Save patient's name |
| `answer_faq` | Look up FAQ answers (hours, insurance, services, etc.) |
| `transfer_to_staff` | Transfer to clinic staff |
| `end_call` | End the conversation |

## WebSocket vs Simple Mode

### WebSocket Mode (Recommended)
- Lowest latency
- Real-time bidirectional audio
- Uses `/twilio/voice` endpoint

### Simple Mode
- Higher latency but simpler
- Uses Twilio's built-in Gather
- Uses `/twilio/voice-simple` endpoint

## Database Schema

The application uses these tables:

- `patients` - Patient information and contact details
- `appointments` - Appointment records with confirmation codes
- `call_logs` - Call history, transcripts, and analytics
- `faq_responses` - Pre-defined answers for the AI
- `conversation_sessions` - Session backup (Redis is primary)
- `business_settings` - Configurable clinic parameters
- `blocked_times` - Dates/times when appointments are unavailable

## Security Considerations

- All SQL queries use parameterized statements
- Environment variables for secrets
- Helmet middleware for HTTP headers
- Rate limiting on API routes
- CORS configuration

## Production Deployment

1. Build the TypeScript:
   ```bash
   npm run build
   ```

2. Use a process manager:
   ```bash
   pm2 start dist/server.js --name spinewell-voice-assistant
   ```

3. Set up SSL/TLS (required for Twilio)

4. Configure environment variables

5. Set up monitoring and logging

## Troubleshooting

### No audio response
- Check TTS API key configuration
- Verify Twilio media stream is connected

### Transcription not working
- Verify Deepgram API key
- Check audio format (should be mulaw 8kHz)

### Database errors
- Ensure PostgreSQL/Supabase is accessible
- Check DATABASE_URL format
- Run migrations

### Redis connection failed
- Verify Upstash credentials
- Check UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN

## License

MIT
