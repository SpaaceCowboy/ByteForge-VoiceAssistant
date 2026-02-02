import 'dotenv/config'
import express, { Express, Request, Response, NextFunction} from 'express'
import {createServer, Server} from 'http'
import helmet from 'helmet'
import cors from 'cors'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'

import redis from './config/redis'

//variables
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
// app setup

const app: Express = express()
const PORT = parseInt(process.env.PORT || '3000')

//middleware
app.use(helmet(
    { contentSecurityPolicy: false,} //twilo bug mikhore vaghti on e xddd
))

// CORS 
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}))

//request logg

app.use(morgan('combined', {
    stream: {
        write: (message: string) => logger.info(message.trim()),

    }
}))

// 404 handler
app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found'})
})

// error handler 
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error('Unhandled error', err);

    res.status(500).json({
        error: process.env.NODE_ENV === 'production'
        ? 'internal server error'
        : err.message,
    })
})

startServer()