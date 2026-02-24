
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
ai-voice-assistant-ts/  
├── src/
│   ├── config/
│   │   ├── database.ts    # PostgreSQL connection pool
│   │   └── redis.ts       # Redis session management
│   ├── functions/
│   │   └── tools.ts       # OpenAI function definitions
│   ├── models/
│   │   ├── customer.ts    # Customer database operations
│   │   ├── reservation.ts # Reservation management
│   │   ├── callLog.ts     # Call logging
│   │   ├── faq.ts         # FAQ lookup
│   │   └── index.ts
│   ├── routes/
│   │   ├── twilio.ts      # Twilio webhooks & WebSocket
│   │   ├── api.ts         # REST API endpoints
│   │   └── index.ts
│   ├── services/
│   │   ├── conversation.ts # Main orchestrator
│   │   ├── openai.ts      # LLM integration
│   │   ├── deepgram.ts    # Speech-to-text
│   │   ├── tts.ts         # Text-to-speech
│   │   └── index.ts
│   ├── utils/
│   │   ├── helpers.ts     # Utility functions
│   │   └── logger.ts      # Logging
│   └── server.ts          # Entry point
├── types/
│   └── index.ts           # TypeScript definitions
├── migrations/
│   └── 001_initial.sql    # Database schema
├── package.json
├── tsconfig.json
└── .env.example
```

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- Twilio Account
- Deepgram API Key
- OpenAI API Key
- (Optional) ElevenLabs API Key

## Quick Start

### 1. Clone and Install

```bash
git clone <repo>
cd ai-voice-assistant-ts
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API keys
```

### 3. Set Up Database

```bash
# Create PostgreSQL database
createdb voice_assistant

# Run migrations
psql -d voice_assistant -f migrations/001_initial.sql
```

### 4. Start Redis

```bash
redis-server
```

### 5. Run Development Server

```bash
npm run dev
```

### 6. Expose with ngrok (for Twilio)

```bash
ngrok http 3000
```

### 7. Configure Twilio

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
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `REDIS_URL` | Redis connection string | Yes |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID | Yes |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token | Yes |
| `TWILIO_PHONE_NUMBER` | Your Twilio phone number | Yes |
| `DEEPGRAM_API_KEY` | Deepgram API key | Yes |
| `OPENAI_API_KEY` | OpenAI API key | Yes |
| `OPENAI_MODEL` | OpenAI model (default: gpt-4o) | No |
| `TTS_PROVIDER` | 'openai' or 'elevenlabs' | No |
| `OPENAI_TTS_VOICE` | Voice for OpenAI TTS | No |
| `ELEVENLABS_API_KEY` | ElevenLabs API key | No |
| `BUSINESS_NAME` | Your business name | Yes |
| `BUSINESS_OPENING_HOUR` | Opening time (HH:MM) | No |
| `BUSINESS_CLOSING_HOUR` | Closing time (HH:MM) | No |
| `TRANSFER_NUMBER` | Number to transfer calls | No |

## API Endpoints

### Health & Status
- `GET /` - Server info
- `GET /api/health` - Health check

### Appointments
- `GET /api/appointments` - List reservations
- `GET /api/appointments/:id` - Get reservation
- `PATCH /api/appointments/:id` - Update reservation
- `DELETE /api/appointments/:id` - Cancel reservation

### Customers
- `GET /api/patients/search?q=query` - Search customers
- `GET /api/patients/:id` - Get customer with history

### Call Logs
- `GET /api/calls` - List calls
- `GET /api/calls/:callSid` - Get call details

### Analytics
- `GET /api/analytics/overview` - Call & reservation stats
- `GET /api/analytics/intents` - Intent breakdown
- `GET /api/analytics/hourly` - Hourly distribution

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

## Function Calling

The AI can perform these actions during a call:

| Function | Description |
|----------|-------------|
| `check_availability` | Check if time slot is available |
| `create_reservation` | Book a new reservation |
| `modify_reservation` | Change existing booking |
| `cancel_reservation` | Cancel a booking |
| `get_customer_reservations` | List customer's bookings |
| `update_customer_name` | Save customer's name |
| `answer_faq` | Look up FAQ answers |
| `transfer_to_human` | Transfer to staff |
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

- `customers` - Caller information
- `reservations` - Booking records
- `call_logs` - Call history & transcripts
- `faq_responses` - Pre-defined answers
- `conversation_sessions` - Session backup
- `business_settings` - Configuration
- `blocked_times` - Unavailable slots

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
   pm2 start dist/server.js --name voice-assistant
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
- Ensure PostgreSQL is running
- Check DATABASE_URL format
- Run migrations

### Redis connection failed
- Verify Redis is running
- Check REDIS_URL format

## License

MIT
