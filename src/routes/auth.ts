/**
 * ===========================================
 * AUTH ROUTES - NEUROSPINE INSTITUTE DASHBOARD
 * ===========================================
 *
 * Handles authentication for the admin dashboard:
 * - POST /auth/setup    — one-time first moderator creation (locks after first use)
 * - POST /auth/login    — email + password → JWT
 * - POST /auth/register — create new dashboard user (moderator-only)
 * - GET  /auth/me       — get current user profile
 *
 * Password hashing: bcryptjs (12 rounds)
 * Token format: JWT with { sub, email, role }
 */

import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import db from '../config/database';
import logger from '../utils/logger';
import {
  authenticate,
  requireRole,
  signToken,
} from '../middleware/auth';
import type { AuthenticatedRequest } from '../middleware/auth';
import {
  validateBody,
  loginSchema,
  registerSchema,
} from '../middleware/validate';
import rateLimit from 'express-rate-limit';
import type { DashboardUserRole } from '../../types/index';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const setupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { success: false, error: 'Too many setup attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Async handler wrapper
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ===========================================
// POST /auth/setup (one-time first moderator)
// ===========================================
// Only works when ZERO users exist in the database.
// After the first moderator is created, this endpoint
// permanently returns 403.

/**
 * @openapi
 * /auth/setup:
 *   post:
 *     tags: [Auth]
 *     summary: Create first moderator (one-time)
 *     description: >
 *       Bootstrap endpoint that creates the initial moderator account.
 *       Only works when zero users exist in the database — permanently returns 403 after first use.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, fullName]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *               fullName:
 *                 type: string
 *     responses:
 *       201:
 *         description: First moderator created with auto-generated JWT
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         email:
 *                           type: string
 *                         fullName:
 *                           type: string
 *                         role:
 *                           type: string
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *       403:
 *         description: Setup already completed
 *       429:
 *         description: Rate limit exceeded
 */
router.post(
  '/setup',
  setupLimiter,
  validateBody(registerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    // Check if any users exist
    const countResult = await db.query<{ count: string }>(
      'SELECT COUNT(*) FROM dashboard_users'
    );

    const userCount = parseInt(countResult.rows[0].count);

    if (userCount > 0) {
      res.status(403).json({
        success: false,
        error: 'Setup already completed. Use /auth/login to sign in, or ask a moderator to create your account.',
      });
      return;
    }

    const { email, password, fullName } = req.body;
    const normalizedEmail = email.toLowerCase();

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create the first moderator
    const result = await db.query<{
      id: number;
      email: string;
      full_name: string;
      role: DashboardUserRole;
      created_at: Date;
    }>(
      `INSERT INTO dashboard_users (email, password_hash, full_name, role)
       VALUES ($1, $2, $3, 'moderator')
       RETURNING id, email, full_name, role, created_at`,
      [normalizedEmail, passwordHash, fullName]
    );

    const newUser = result.rows[0];

    // Auto-generate a token so they're immediately logged in
    const token = signToken(newUser.id, newUser.email, newUser.role);

    logger.info('Initial moderator created via /auth/setup', {
      userId: newUser.id,
      email: newUser.email,
    });

    res.status(201).json({
      success: true,
      message: 'First moderator account created. This endpoint is now locked.',
      data: {
        token,
        user: {
          id: newUser.id,
          email: newUser.email,
          fullName: newUser.full_name,
          role: newUser.role,
          createdAt: newUser.created_at,
        },
      },
    });
  })
);

// ===========================================
// POST /auth/login
// ===========================================

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login
 *     description: Authenticate with email and password to receive a JWT token.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@neurospine.com
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         email:
 *                           type: string
 *                         fullName:
 *                           type: string
 *                         role:
 *                           type: string
 *                           enum: [user, moderator]
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Account deactivated
 *       429:
 *         description: Rate limit exceeded
 */
router.post(
  '/login',
  loginLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    // Find user by email
    const result = await db.query<{
      id: number;
      email: string;
      password_hash: string;
      full_name: string;
      role: DashboardUserRole;
      is_active: boolean;
    }>(
      'SELECT id, email, password_hash, full_name, role, is_active FROM dashboard_users WHERE email = $1',
      [email.toLowerCase()]
    );

    const user = result.rows[0];

    if (!user) {
      // Don't reveal whether the email exists
      res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      });
      return;
    }

    if (!user.is_active) {
      res.status(403).json({
        success: false,
        error: 'Account is deactivated. Contact an administrator.',
      });
      return;
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      });
      return;
    }

    // Update last_login timestamp
    await db.query(
      'UPDATE dashboard_users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    // Generate JWT
    const token = signToken(user.id, user.email, user.role);

    logger.info('Dashboard login', { userId: user.id, email: user.email });

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
        },
      },
    });
  })
);

// ===========================================
// POST /auth/register (moderator-only)
// ===========================================

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register new user (moderator only)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, fullName]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *               fullName:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [user, moderator]
 *                 default: user
 *     responses:
 *       201:
 *         description: User created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     email:
 *                       type: string
 *                     fullName:
 *                       type: string
 *                     role:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       403:
 *         description: Moderator role required
 *       409:
 *         description: Email already exists
 */
router.post(
  '/register',
  authenticate,
  requireRole('moderator'),
  validateBody(registerSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { email, password, fullName, role } = req.body;
    const normalizedEmail = email.toLowerCase();

    // Check if email already exists
    const existingResult = await db.query(
      'SELECT id FROM dashboard_users WHERE email = $1',
      [normalizedEmail]
    );

    if (existingResult.rows.length > 0) {
      res.status(409).json({
        success: false,
        error: 'A user with this email already exists',
      });
      return;
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const result = await db.query<{
      id: number;
      email: string;
      full_name: string;
      role: DashboardUserRole;
      created_at: Date;
    }>(
      `INSERT INTO dashboard_users (email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, full_name, role, created_at`,
      [normalizedEmail, passwordHash, fullName, role || 'user']
    );

    const newUser = result.rows[0];

    logger.info('Dashboard user registered', {
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role,
      createdBy: req.user?.id,
    });

    res.status(201).json({
      success: true,
      data: {
        id: newUser.id,
        email: newUser.email,
        fullName: newUser.full_name,
        role: newUser.role,
        createdAt: newUser.created_at,
      },
    });
  })
);

// ===========================================
// GET /auth/me
// ===========================================

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user profile
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Current user details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     email:
 *                       type: string
 *                     fullName:
 *                       type: string
 *                     role:
 *                       type: string
 *                       enum: [user, moderator]
 *                     isActive:
 *                       type: boolean
 *                     lastLogin:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Not authenticated
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    // Fetch full profile (excluding password_hash)
    const result = await db.query<{
      id: number;
      email: string;
      full_name: string;
      role: DashboardUserRole;
      is_active: boolean;
      last_login: Date | null;
      created_at: Date;
    }>(
      `SELECT id, email, full_name, role, is_active, last_login, created_at
       FROM dashboard_users WHERE id = $1`,
      [req.user.id]
    );

    const user = result.rows[0];

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        isActive: user.is_active,
        lastLogin: user.last_login,
        createdAt: user.created_at,
      },
    });
  })
);

// ===========================================
// PATCH /auth/password (change own password)
// ===========================================

/**
 * @openapi
 * /auth/password:
 *   patch:
 *     tags: [Auth]
 *     summary: Change own password
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password, newPassword]
 *             properties:
 *               password:
 *                 type: string
 *                 description: Current password
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *                 description: New password
 *     responses:
 *       200:
 *         description: Password updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       401:
 *         description: Current password incorrect
 */
router.patch(
  '/password',
  authenticate,
  validateBody(
    loginSchema.pick({ password: true }).extend({
      newPassword: registerSchema.shape.password,
    })
  ),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const { password: currentPassword, newPassword } = req.body;

    // Verify current password
    const result = await db.query<{ password_hash: string }>(
      'SELECT password_hash FROM dashboard_users WHERE id = $1',
      [req.user.id]
    );

    const user = result.rows[0];
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValid) {
      res.status(401).json({ success: false, error: 'Current password is incorrect' });
      return;
    }

    // Hash new password and update
    const newHash = await bcrypt.hash(newPassword, 12);
    await db.query(
      'UPDATE dashboard_users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newHash, req.user.id]
    );

    logger.info('Password changed', { userId: req.user.id });

    res.json({ success: true, message: 'Password updated' });
  })
);

export default router;