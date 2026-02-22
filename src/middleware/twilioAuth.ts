/**
 * Twilio Webhook Signature Validation Middleware
 *
 * Verifies that incoming requests to /twilio/* endpoints
 * are genuinely from Twilio using the X-Twilio-Signature header.
 * Skips validation in development mode for easier local testing.
 */
import { Request, Response, NextFunction } from 'express';
import twilio from 'twilio';
import logger from '../utils/logger';

export function validateTwilioWebhook(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    // Skip validation in development for local testing with ngrok
    if (process.env.NODE_ENV === 'development' && process.env.SKIP_TWILIO_VALIDATION === 'true') {
        logger.debug('Skipping Twilio webhook validation (development mode)');
        next();
        return;
    }

    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!authToken) {
        logger.error('TWILIO_AUTH_TOKEN not set — cannot validate webhook');
        res.status(500).send('Server misconfiguration');
        return;
    }

    const signature = req.headers['x-twilio-signature'] as string;

    if (!signature) {
        logger.warn('Rejected request: missing X-Twilio-Signature header', {
            ip: req.ip,
            path: req.path,
        });
        res.status(403).send('Forbidden');
        return;
    }

    // Build the full URL that Twilio used to generate the signature
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const url = `${protocol}://${host}${req.originalUrl}`;

    const isValid = twilio.validateRequest(
        authToken,
        signature,
        url,
        req.body || {}
    );

    if (!isValid) {
        logger.warn('Rejected request: invalid Twilio signature', {
            ip: req.ip,
            path: req.path,
        });
        res.status(403).send('Forbidden');
        return;
    }

    next();
}

export default validateTwilioWebhook;
