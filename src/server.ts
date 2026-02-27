/**
 * ===========================================
 * SERVER - NEUROSPINE INSTITUTE VOICE ASSISTANT
 * ===========================================
 *
 * Express server with:
 * - Twilio webhook validation on /twilio routes
 * - JWT-protected /api routes
 * - Public /auth routes for login
 * - Media stream WebSocket for low-latency voice
 */

import 'dotenv/config';
import express, { Express, Request, Response, NextFunction } from 'express';
import { createServer, Server } from 'http';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { twilioRoutes, setupMediaStreamWebSocket, apiRoutes, authRoutes } from './routes';
import { validateTwilioWebhook } from './middleware';
import database from './config/database';
import redis from './config/redis';
import logger from './utils/logger';

// ===========================================
// ENV VALIDATION
// ===========================================

const requiredEnvVars = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'DEEPGRAM_API_KEY',
  'OPENAI_API_KEY',
];

// JWT_SECRET is required in production (for dashboard auth)
if (process.env.NODE_ENV === 'production') {
  requiredEnvVars.push('JWT_SECRET');
}

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logger.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

if (!process.env.TWILIO_ACCOUNT_SID!.startsWith('AC')) {
  logger.error(
    'TWILIO_ACCOUNT_SID must start with "AC" (Account SID). ' +
      'It looks like you may have set an API Key SID (starts with "SK") instead. ' +
      'Find your Account SID at https://console.twilio.com/'
  );
  process.exit(1);
}

// Default JWT_SECRET for development (override in .env!)
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'dev-secret-change-in-production';
  logger.warn('JWT_SECRET not set — using default. Set it in .env for production!');
}

// ===========================================
// APP SETUP
// ===========================================

const app: Express = express();
const PORT = parseInt(process.env.PORT || '3000');

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Twilio TwiML requires inline content
  })
);

// Trust proxy (for ngrok, load balancers — needed for Twilio sig validation)
app.set('trust proxy', 1);

// CORS
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Request logging
app.use(
  morgan('combined', {
    stream: {
      write: (message: string) => logger.info(message.trim()),
    },
  })
);

// Body parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Rate limiting for API and auth routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => req.path.startsWith('/twilio'),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // Stricter for auth endpoints
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', apiLimiter);
app.use('/auth', authLimiter);

// ===========================================
// ROUTES
// ===========================================

// Twilio webhooks (validated via signature)
app.use('/twilio', validateTwilioWebhook, twilioRoutes);

// Auth routes (public — login, protected — register, me)
app.use('/auth', authRoutes);

// API routes (JWT-protected — see middleware inside api.ts)
app.use('/api', apiRoutes);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'NeuroSpine Institute - AI Voice Assistant',
    status: 'running',
    version: '2.0.0',
    endpoints: {
      auth: {
        login: 'POST /auth/login',
        register: 'POST /auth/register (moderator)',
        me: 'GET /auth/me',
        password: 'PATCH /auth/password',
      },
      twilio: {
        voice: 'POST /twilio/voice',
        voiceSimple: 'POST /twilio/voice-simple',
        status: 'POST /twilio/status',
      },
      api: {
        health: 'GET /api/health',
        appointments: 'GET /api/appointments',
        patients: 'GET /api/patients/search',
        calls: 'GET /api/calls',
        analytics: 'GET /api/analytics/*',
        faqs: 'GET /api/faqs',
      },
    },
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', err);

  res.status(500).json({
    error:
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message,
  });
});

// ===========================================
// HTTP SERVER & WEBSOCKET
// ===========================================

const server: Server = createServer(app);

setupMediaStreamWebSocket(server);

// ===========================================
// STARTUP
// ===========================================

async function startServer(): Promise<void> {
  try {
    logger.info('Connecting to database...');
    const dbConnected = await database.testConnection();
    if (!dbConnected) {
      throw new Error('Database connection failed');
    }

    logger.info('Connecting to Redis...');
    await redis.connect();

    server.listen(PORT, () => {
      logger.info('='.repeat(50));
      logger.info('NeuroSpine Institute — AI Voice Assistant');
      logger.info('='.repeat(50));
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Port: ${PORT}`);
      logger.info(`TTS Provider: ${process.env.TTS_PROVIDER || 'openai'}`);
      logger.info(`OpenAI Model: ${process.env.OPENAI_MODEL || 'gpt-4o'}`);
      logger.info(`Twilio Validation: ${process.env.SKIP_TWILIO_VALIDATION === 'true' ? 'SKIPPED (dev)' : 'ENABLED'}`);
      logger.info(`JWT Auth: ENABLED`);
      logger.info('='.repeat(50));
      logger.info('');
      logger.info('Twilio Webhook URLs (configure in Twilio console):');
      logger.info(`  Voice:  POST https://<your-domain>/twilio/voice`);
      logger.info(`  Status: POST https://<your-domain>/twilio/status`);
      logger.info('');
      logger.info('Dashboard Auth:');
      logger.info(`  Login:  POST https://<your-domain>/auth/login`);
      logger.info('');
      logger.info('For local development with ngrok:');
      logger.info(`  ngrok http ${PORT}`);
      logger.info('');
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

// ===========================================
// GRACEFUL SHUTDOWN
// ===========================================

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received. Starting graceful shutdown...`);

  const forceShutdownTimeout = setTimeout(() => {
    logger.error('Forceful shutdown due to timeout');
    process.exit(1);
  }, 10000);

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    logger.info('HTTP server closed');

    await redis.disconnect();
    await database.closePool();

    clearTimeout(forceShutdownTimeout);
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception', error);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled promise rejection', reason);
});

startServer();