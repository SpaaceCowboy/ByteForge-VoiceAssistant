import 'dotenv/config';
import express, { Express, Request, Response, NextFunction } from 'express';
import { createServer, Server } from 'http';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { twilioRoutes, setupMediaStreamWebSocket, apiRoutes } from './routes';
import database from './config/database';
import redis from './config/redis';
import logger from './utils/logger';

// Required environment variables
const requiredEnvVars = [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'DEEPGRAM_API_KEY',
    'OPENAI_API_KEY',
  ];

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

// App setup

const app: Express = express()
const PORT = parseInt(process.env.PORT || '3000')

// Middleware
app.use(helmet(
    { contentSecurityPolicy: false }
))

// CORS
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}))

// Request logging
app.use(morgan('combined', {
    stream: {
        write: (message: string) => logger.info(message.trim()),
    }
}))

// Body parsing
app.use(express.urlencoded({ extended: true}));
app.use(express.json())

// Rate limiting for API routes
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: { error: 'Too many requests, please try again later'},
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req: Request) => req.path.startsWith('/twilio')
})

app.use('/api', apiLimiter)

// Routes
app.use('/twilio', twilioRoutes);
app.use('/api', apiRoutes);
app.get('/', (req: Request, res: Response) => {
    res.json( {
        name: 'SpineWell Clinic - AI Voice Assistant',
        status: 'running',
        version: '1.0.0',
        endpoints: {
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
        }
      }
    })
})

// 404 handler
app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found'})
})

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error('Unhandled error', err);

    res.status(500).json({
        error: process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message,
    })
})

// HTTP server and WebSocket

const server: Server = createServer(app);

setupMediaStreamWebSocket(server);

// Startup

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
            logger.info('SpineWell Clinic - AI Voice Assistant Started');
            logger.info('='.repeat(50));
            logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
            logger.info(`Port: ${PORT}`);
            logger.info(`TTS Provider: ${process.env.TTS_PROVIDER || 'openai'}`);
            logger.info(`OpenAI Model: ${process.env.OPENAI_MODEL || 'gpt-4o'}`);
            logger.info('='.repeat(50));
            logger.info('');
            logger.info(`Twilio Webhook URLs (configure in Twilio console):`);
            logger.info(`Voice: POST https://<your-domain>/twilio/voice`);
            logger.info(`Status: POST https://<your-domain>/twilio/status`);
            logger.info('');
            logger.info('For local development with ngrok:');
            logger.info(` ngrok http ${PORT}`);
            logger.info('')
        })
    } catch (error) {
        logger.error('Failed to start server', error);
        process.exit(1);
    }
}

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
    logger.info(`${signal} received. Starting graceful shutdown...`);

    // Timeout for shutdown
    const forceShutDownTimeout = setTimeout(() => {
        logger.error('Forceful shutdown due to timeout');
        process.exit(1);
    }, 10000);

    try {
        // Stop accepting new connections
        server.close(() => {
            logger.info('HTTP server closed');
        })

        await redis.disconnect();

        await database.closePool();

        clearTimeout(forceShutDownTimeout);
        logger.info('Graceful shutdown completed');
        process.exit(0);
    } catch (error) {
        logger.error('Error during shutdown', error);
        process.exit(1)
    }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught exception', error);
    shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason: unknown) => {
    logger.error('Unhandled promise rejection', reason)
})

startServer()
