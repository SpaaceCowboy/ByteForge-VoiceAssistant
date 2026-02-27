import {Response, Request, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import db from '../config/database';
import logger from '../utils/logger';
import type { DashboardUserRole } from '../../types';

export interface AuthenticatedRequest extends Request {
    user?: {
        id: number;
        email: string,
        fullName: string;
        role: DashboardUserRole;
    };
}

interface JwtPayload {
    sub: number; // user id
    email: string;
    role: DashboardUserRole;
    iat?: number;
    exp?: number;
}

function getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET environment variable is not set');
    }
    return secret;
}

export function signToken(userId: number, email: string, role: DashboardUserRole): string {
    const secret = getJwtSecret();
    const expiresIn = process.env.JWT_EXPIRES_IN || '8h';

    return jwt.sign(
      { sub: userId, email, role } as JwtPayload,
      secret,
      { expiresIn: expiresIn as string & jwt.SignOptions['expiresIn'] }
    );
  }

  export function verifyToken(token: string): JwtPayload | null {
    try {
        const secret = getJwtSecret();
        return jwt.verify(token, secret) as unknown as JwtPayload;
    } catch {
        return null;
    }
  }

  export async function authenticate(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ success: false, error: 'Authentication required'});
        return;
    }

    const token = authHeader.slice(7);

    const payload = verifyToken(token);
    if (!payload) {
        res.status(401).json({ success: false, error: 'Invalid or expired token'});
        return;
    }

    try {
        const result = await db.query<{
            id: number; email: string; full_name: string;
            role: DashboardUserRole; is_active: boolean;
        }>(
            'SELECT id, email, full_name, role, is_active FROM dashboard_users WHERE id = $1',
            [payload.sub]
        );

        const user = result.rows[0];

        if (!user) {
            res.status(401).json({ success: false, error: 'User not found'});
            return;
        }

        if (!user.is_active) {
            res.status(403).json({ success: false, error: 'Account deactivated'});
            return;
        }

        req.user = {
            id: user.id,
            email: user.email,
            fullName: user.full_name,
            role: user.role
        };

        next();
    } catch (error) {
        logger.error('Auth middleware DB error', error);
        res.status(500).json({ success: false, error: 'Authentication error'});
    }
  }

  export function requireRole(
    ...allowedRoles: DashboardUserRole[]
  ): (req: AuthenticatedRequest, res: Response, next: NextFunction) => void {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            res.status(401).json({ success: false, error: 'Authentication required'});
            return;
        }

        if (!allowedRoles.includes(req.user.role)) {
            logger.warn('Access denied: insufficient role', {
                userId: req.user.id,
                userRole: req.user.role,
                requiredRole: allowedRoles,
                path: req.path,
            });
            res.status(403).json({
                success: false,
                error: 'Insufficient permissions',
            });
            return;
        }

        next();
    };
  }

  export default { authenticate, requireRole, signToken, verifyToken}
