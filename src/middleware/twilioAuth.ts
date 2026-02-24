//webhool validation
//prevent spoofed calls

import { Request, Response, NextFunction } from 'express';
import twilio from 'twilio';
import logger from '../utils/logger';

const { validateRequest } = twilio;

export function validateTwilioWebhook(
    req: Request,
    res: Response,
    next: NextFunction, 
): void {
    if (
        process.env.NODE_ENV === 'development' &&
        process.env.SKIP_TWILIO_VALIDATION === 'true'
    ) {
        return next();
    }

    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!authToken) {
        logger.error('TWILIO_AUTH_TOKE not set - cannot validate webhooks');
        res.status(500).json({ error: 'Server misconfigured'});
        return;
    }

    const twilioSignature = req.headers['x-twilio-signatuer'] as string;

    if (!twilioSignature) {
        logger.warn('Rejected request: missing x-Twilio-signature', {
            ip: req.ip,
            path: req.path,
        });
        res.status(403).json({error: 'Forbiddeb: missing signaturee'});
        return;
    }

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const fullUrl = `${protocol}://${host}${req.originalUrl}`;

    const params = req.body || {}

    const isValid  = validateRequest(authToken, twilioSignature, fullUrl, params);

    if (!isValid) {
        logger.warn('Rejected request: invalid Twilio signature', {
            ip: req.ip,
            path: req.path,
            url: fullUrl,
        });
        res.status(403).json({ error: 'Forbidden: invalid signature'});
        return;
    }

    next();
}

export default validateTwilioWebhook
