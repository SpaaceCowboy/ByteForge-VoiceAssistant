

import { Router, Request, Response, NextFunction } from 'express';
import { patientModel, callLogModel, faqModel, appointmentModel, sessionModel } from '../models';
import { getCurrentDate, formatDate } from '../utils/helpers';
import database from '../config/database';
import redis from '../config/redis';
import logger from '../utils/logger';
import {
  authenticate,
  requireRole,
  validateBody,
  validateQuery,
  appointmentModifySchema,
  appointmentCancelSchema,
  appointmentQuerySchema,
  patientUpdateSchema,
  patientSearchSchema,
  callsQuerySchema,
  faqCreateSchema,
  faqUpdateSchema,
  dateRangeQuerySchema,
} from '../middleware';
import type { AuthenticatedRequest } from '../middleware';
import type { ApiResponse, PaginatedResponse } from '../../types/index';

const router = Router();

// Async handler wrapper
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function parseIdParam(req: Request, res: Response): number | null {
  const id = parseInt(req.params.id);
  if (isNaN(id) || id <= 0) {
    res.status(400).json({ success: false, error: 'Invalid ID' });
    return null;
  }
  return id;
}

// ===========================================
// HEALTH CHECK (public)
// ===========================================

/**
 * @openapi
 * /api/health:
 *   get:
 *     tags: [Health]
 *     summary: Health check
 *     description: Returns server status. Pass `?detailed=true` to include database and Redis connectivity.
 *     parameters:
 *       - in: query
 *         name: detailed
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *         description: Include component health details
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [ok, degraded, error]
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 version:
 *                   type: string
 *                 components:
 *                   type: object
 *                   description: Only present when detailed=true
 *                   properties:
 *                     database:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           enum: [ok, error]
 *                     redis:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           enum: [ok, error]
 *       503:
 *         description: All components are down
 */
router.get('/health', asyncHandler(async (req: Request, res: Response) => {
  const baseResponse = {
    status: 'ok' as 'ok' | 'degraded' | 'error',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '2.0.0',
  };

  if (req.query.detailed !== 'true') {
    res.json(baseResponse);
    return;
  }

  const [dbHealthy, redisHealthy] = await Promise.all([
    database.testConnection().catch(() => false),
    redis.ping().catch(() => false),
  ]);

  const status = dbHealthy && redisHealthy
    ? 'ok'
    : dbHealthy || redisHealthy
      ? 'degraded'
      : 'error';

  const statusCode = status === 'error' ? 503 : 200;

  res.status(statusCode).json({
    ...baseResponse,
    status,
    components: {
      database: { status: dbHealthy ? 'ok' : 'error' },
      redis: { status: redisHealthy ? 'ok' : 'error' },
    },
  });
}));

// ===========================================
// All routes below require authentication
// ===========================================
router.use(authenticate);

// ===========================================
// APPOINTMENTS
// ===========================================

/**
 * @openapi
 * /api/appointments:
 *   get:
 *     tags: [Appointments]
 *     summary: List appointments by date
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *           example: '2026-02-27'
 *         description: Date to query (defaults to today)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [scheduled, confirmed, checked_in, in_progress, completed, cancelled, no_show, rescheduled]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 200
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *     responses:
 *       200:
 *         description: List of appointments
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/appointments',
  validateQuery(appointmentQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { date } = req.query;

    const targetDate =
      date && typeof date === 'string' ? date : getCurrentDate();
    const appointments = await appointmentModel.findByDate(targetDate);

    const response: PaginatedResponse<(typeof appointments)[0]> = {
      success: true,
      data: appointments,
      count: appointments.length,
    };

    res.json(response);
  })
);

/**
 * @openapi
 * /api/appointments/{id}:
 *   get:
 *     tags: [Appointments]
 *     summary: Get appointment by ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Appointment details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       404:
 *         description: Appointment not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/appointments/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseIdParam(req, res);
    if (id === null) return;
    const appointment = await appointmentModel.findById(id);

    if (!appointment) {
      res.status(404).json({ success: false, error: 'Appointment not found' });
      return;
    }

    res.json({ success: true, data: appointment });
  })
);

/**
 * @openapi
 * /api/appointments/{id}:
 *   patch:
 *     tags: [Appointments]
 *     summary: Update an appointment
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *                 example: '2026-03-01'
 *               time:
 *                 type: string
 *                 example: '14:30'
 *               doctorId:
 *                 type: integer
 *               departmentId:
 *                 type: integer
 *               locationId:
 *                 type: integer
 *               durationMinutes:
 *                 type: integer
 *                 minimum: 5
 *                 maximum: 480
 *               appointmentType:
 *                 type: string
 *                 enum: [consultation, follow_up, procedure, imaging, urgent_care, pre_surgical, post_surgical, pain_management, therapy]
 *               reasonForVisit:
 *                 type: string
 *                 maxLength: 500
 *               specialInstructions:
 *                 type: string
 *                 maxLength: 500
 *               status:
 *                 type: string
 *                 enum: [scheduled, confirmed, checked_in, in_progress, completed, cancelled, no_show, rescheduled]
 *     responses:
 *       200:
 *         description: Updated appointment
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       404:
 *         description: Appointment not found
 */
router.patch(
  '/appointments/:id',
  validateBody(appointmentModifySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseIdParam(req, res);
    if (id === null) return;
    const updates = req.body;

    const appointment = await appointmentModel.modify(id, {
      date: updates.date,
      time: updates.time,
      doctorId: updates.doctorId,
      departmentId: updates.departmentId,
      locationId: updates.locationId,
      durationMinutes: updates.durationMinutes,
      appointmentType: updates.appointmentType,
      reasonForVisit: updates.reasonForVisit,
      specialInstructions: updates.specialInstructions,
      status: updates.status,
    });

    if (!appointment) {
      res.status(404).json({ success: false, error: 'Appointment not found' });
      return;
    }

    res.json({ success: true, data: appointment });
  })
);

/**
 * @openapi
 * /api/appointments/{id}:
 *   delete:
 *     tags: [Appointments]
 *     summary: Cancel an appointment
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 maxLength: 500
 *                 description: Cancellation reason
 *     responses:
 *       200:
 *         description: Cancelled appointment
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       404:
 *         description: Appointment not found
 */
router.delete(
  '/appointments/:id',
  validateBody(appointmentCancelSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseIdParam(req, res);
    if (id === null) return;
    const { reason } = req.body;

    const appointment = await appointmentModel.cancel(id, reason);

    if (!appointment) {
      res.status(404).json({ success: false, error: 'Appointment not found' });
      return;
    }

    res.json({ success: true, data: appointment });
  })
);

// ===========================================
// PATIENTS
// ===========================================

/**
 * @openapi
 * /api/patients/search:
 *   get:
 *     tags: [Patients]
 *     summary: Search patients
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 200
 *         description: Search query (name, phone, email)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: Matching patients
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 *       400:
 *         description: Missing search query
 */
router.get(
  '/patients/search',
  validateQuery(patientSearchSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { q, limit = '20' } = req.query;

    if (!q || typeof q !== 'string') {
      res.status(400).json({ success: false, error: 'Search query (q) required' });
      return;
    }

    const patients = await patientModel.search(q, parseInt(limit as string));

    res.json({
      success: true,
      data: patients,
      count: patients.length,
    });
  })
);

/**
 * @openapi
 * /api/patients/{id}:
 *   get:
 *     tags: [Patients]
 *     summary: Get patient with appointment history
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Patient details with history
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       404:
 *         description: Patient not found
 */
router.get(
  '/patients/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseIdParam(req, res);
    if (id === null) return;
    const patient = await patientModel.findById(id);

    if (!patient) {
      res.status(404).json({ success: false, error: 'Patient not found' });
      return;
    }

    const patientWithHistory = await patientModel.getPatientWithHistory(
      patient.phone
    );

    res.json({ success: true, data: patientWithHistory });
  })
);

/**
 * @openapi
 * /api/patients/{id}:
 *   patch:
 *     tags: [Patients]
 *     summary: Update patient (moderator only)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *                 maxLength: 200
 *               email:
 *                 type: string
 *                 format: email
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *               address:
 *                 type: string
 *                 maxLength: 500
 *               insuranceProvider:
 *                 type: string
 *               insuranceId:
 *                 type: string
 *               emergencyContactName:
 *                 type: string
 *               emergencyContactPhone:
 *                 type: string
 *               preferredLanguage:
 *                 type: string
 *               preferredLocationId:
 *                 type: integer
 *               preferredDoctorId:
 *                 type: integer
 *               notes:
 *                 type: string
 *                 maxLength: 2000
 *     responses:
 *       200:
 *         description: Updated patient
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       403:
 *         description: Moderator role required
 *       404:
 *         description: Patient not found
 */
router.patch(
  '/patients/:id',
  requireRole('moderator'),
  validateBody(patientUpdateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseIdParam(req, res);
    if (id === null) return;
    const updates = req.body;

    const patient = await patientModel.update(id, {
      full_name: updates.fullName,
      email: updates.email,
      date_of_birth: updates.dateOfBirth,
      address: updates.address,
      insurance_provider: updates.insuranceProvider,
      insurance_id: updates.insuranceId,
      emergency_contact_name: updates.emergencyContactName,
      emergency_contact_phone: updates.emergencyContactPhone,
      preferred_language: updates.preferredLanguage,
      preferred_location_id: updates.preferredLocationId,
      preferred_doctor_id: updates.preferredDoctorId,
      notes: updates.notes,
    });

    if (!patient) {
      res.status(404).json({ success: false, error: 'Patient not found' });
      return;
    }

    res.json({ success: true, data: patient });
  })
);

// ===========================================
// CALL LOGS
// ===========================================

/**
 * @openapi
 * /api/calls:
 *   get:
 *     tags: [Calls]
 *     summary: List call logs
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date (defaults to 7 days ago)
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (defaults to today)
 *       - in: query
 *         name: transferred
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *         description: Filter to transferred calls only
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 500
 *           default: 50
 *     responses:
 *       200:
 *         description: List of call logs
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 */
router.get(
  '/calls',
  validateQuery(callsQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { start_date, end_date, transferred, limit = '50' } = req.query;

    const startDate = (start_date as string) || getDateDaysAgo(7);
    const endDate = (end_date as string) || getCurrentDate();

    let calls;

    if (transferred === 'true') {
      calls = await callLogModel.findTransferredCalls(startDate, endDate);
    } else {
      calls = await callLogModel.findRecent(
        startDate,
        endDate,
        parseInt(limit as string)
      );
    }

    res.json({
      success: true,
      data: calls,
      count: calls.length,
    });
  })
);

/**
 * @openapi
 * /api/calls/{callSid}:
 *   get:
 *     tags: [Calls]
 *     summary: Get call by SID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: callSid
 *         required: true
 *         schema:
 *           type: string
 *         description: Twilio Call SID
 *     responses:
 *       200:
 *         description: Call log details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       404:
 *         description: Call not found
 */
router.get(
  '/calls/:callSid',
  asyncHandler(async (req: Request, res: Response) => {
    const callSid = req.params.callSid;
    const call = await callLogModel.findByCallSid(callSid);

    if (!call) {
      res.status(404).json({ success: false, error: 'Call not found' });
      return;
    }

    res.json({ success: true, data: call });
  })
);

// ===========================================
// ANALYTICS
// ===========================================

/**
 * @openapi
 * /api/analytics/overview:
 *   get:
 *     tags: [Analytics]
 *     summary: Dashboard overview statistics
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date (defaults to 30 days ago)
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (defaults to today)
 *     responses:
 *       200:
 *         description: Call and appointment statistics for the period
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
 *                     period:
 *                       type: object
 *                       properties:
 *                         start:
 *                           type: string
 *                           format: date
 *                         end:
 *                           type: string
 *                           format: date
 *                     calls:
 *                       type: object
 *                     appointments:
 *                       type: object
 */
router.get(
  '/analytics/overview',
  validateQuery(dateRangeQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { start_date, end_date } = req.query;

    const startDate = (start_date as string) || getDateDaysAgo(30);
    const endDate = (end_date as string) || getCurrentDate();

    const [callStats, appointmentStats] = await Promise.all([
      callLogModel.getStats(startDate, endDate),
      appointmentModel.getStats(startDate, endDate),
    ]);

    res.json({
      success: true,
      data: {
        period: { start: startDate, end: endDate },
        calls: callStats,
        appointments: appointmentStats,
      },
    });
  })
);

/**
 * @openapi
 * /api/analytics/intents:
 *   get:
 *     tags: [Analytics]
 *     summary: Intent breakdown
 *     description: Distribution of detected caller intents over a date range
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Intent breakdown data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get(
  '/analytics/intents',
  validateQuery(dateRangeQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { start_date, end_date } = req.query;

    const startDate = (start_date as string) || getDateDaysAgo(30);
    const endDate = (end_date as string) || getCurrentDate();

    const intents = await callLogModel.getIntentBreakdown(startDate, endDate);

    res.json({ success: true, data: intents });
  })
);

/**
 * @openapi
 * /api/analytics/hourly:
 *   get:
 *     tags: [Analytics]
 *     summary: Hourly call distribution
 *     description: Number of calls grouped by hour of day
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Hourly distribution data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get(
  '/analytics/hourly',
  validateQuery(dateRangeQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { start_date, end_date } = req.query;

    const startDate = (start_date as string) || getDateDaysAgo(7);
    const endDate = (end_date as string) || getCurrentDate();

    const hourly = await callLogModel.getHourlyDistribution(startDate, endDate);

    res.json({ success: true, data: hourly });
  })
);

// ===========================================
// SESSION MANAGEMENT (moderator only)
// ===========================================

/**
 * @openapi
 * /api/sessions/stats:
 *   get:
 *     tags: [Sessions]
 *     summary: Get session statistics (moderator only)
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Session statistics
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       403:
 *         description: Moderator role required
 */
router.get(
  '/sessions/stats',
  requireRole('moderator'),
  asyncHandler(async (req: Request, res: Response) => {
    const stats = await sessionModel.getSessionStats();
    res.json({ success: true, data: stats });
  })
);

/**
 * @openapi
 * /api/sessions/cleanup:
 *   post:
 *     tags: [Sessions]
 *     summary: Trigger session cleanup (moderator only)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: hours
 *         schema:
 *           type: integer
 *           default: 24
 *         description: Delete sessions older than this many hours
 *     responses:
 *       200:
 *         description: Cleanup result
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
 *                     deletedCount:
 *                       type: integer
 *                     olderThanHours:
 *                       type: integer
 *       403:
 *         description: Moderator role required
 */
router.post(
  '/sessions/cleanup',
  requireRole('moderator'),
  asyncHandler(async (req: Request, res: Response) => {
    const olderThanHours = parseInt(req.query.hours as string) || 24;
    const deletedCount = await sessionModel.deleteOldSessions(olderThanHours);
    res.json({ success: true, data: { deletedCount, olderThanHours } });
  })
);

// ===========================================
// FAQs
// ===========================================

/**
 * @openapi
 * /api/faqs:
 *   get:
 *     tags: [FAQs]
 *     summary: List FAQs
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *     responses:
 *       200:
 *         description: List of FAQs
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 */
// Read: any authenticated user
router.get(
  '/faqs',
  asyncHandler(async (req: Request, res: Response) => {
    const { category } = req.query;

    let faqs;

    if (category && typeof category === 'string') {
      faqs = await faqModel.findByCategory(category);
    } else {
      faqs = await faqModel.findAll();
    }

    res.json({
      success: true,
      data: faqs,
      count: faqs.length,
    });
  })
);

/**
 * @openapi
 * /api/faqs/categories:
 *   get:
 *     tags: [FAQs]
 *     summary: List FAQ categories
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of category names
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get(
  '/faqs/categories',
  asyncHandler(async (req: Request, res: Response) => {
    const categories = await faqModel.getCategories();
    res.json({ success: true, data: categories });
  })
);

/**
 * @openapi
 * /api/faqs:
 *   post:
 *     tags: [FAQs]
 *     summary: Create FAQ (moderator only)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [questionPattern, answer, category]
 *             properties:
 *               questionPattern:
 *                 type: string
 *                 maxLength: 500
 *               questionVariations:
 *                 type: array
 *                 items:
 *                   type: string
 *                 maxItems: 20
 *               answer:
 *                 type: string
 *                 maxLength: 5000
 *               answerShort:
 *                 type: string
 *                 maxLength: 500
 *               category:
 *                 type: string
 *                 maxLength: 100
 *               priority:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 100
 *     responses:
 *       201:
 *         description: Created FAQ
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         description: Validation error
 *       403:
 *         description: Moderator role required
 */
// Write: moderator only
router.post(
  '/faqs',
  requireRole('moderator'),
  validateBody(faqCreateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      questionPattern,
      questionVariations,
      answer,
      answerShort,
      category,
      priority,
    } = req.body;

    const faq = await faqModel.create({
      questionPattern,
      questionVariations,
      answer,
      answerShort,
      category,
      priority,
    });

    res.status(201).json({ success: true, data: faq });
  })
);

/**
 * @openapi
 * /api/faqs/{id}:
 *   patch:
 *     tags: [FAQs]
 *     summary: Update FAQ (moderator only)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               questionPattern:
 *                 type: string
 *                 maxLength: 500
 *               questionVariations:
 *                 type: array
 *                 items:
 *                   type: string
 *                 maxItems: 20
 *               answer:
 *                 type: string
 *                 maxLength: 5000
 *               answerShort:
 *                 type: string
 *                 maxLength: 500
 *                 nullable: true
 *               category:
 *                 type: string
 *                 maxLength: 100
 *               priority:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 100
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Updated FAQ
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       403:
 *         description: Moderator role required
 *       404:
 *         description: FAQ not found
 */
router.patch(
  '/faqs/:id',
  requireRole('moderator'),
  validateBody(faqUpdateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseIdParam(req, res);
    if (id === null) return;
    const updates = req.body;

    const faq = await faqModel.update(id, {
      question_pattern: updates.questionPattern,
      question_variations: updates.questionVariations,
      answer: updates.answer,
      answer_short: updates.answerShort,
      category: updates.category,
      priority: updates.priority,
      is_active: updates.isActive,
    });

    if (!faq) {
      res.status(404).json({ success: false, error: 'FAQ not found' });
      return;
    }

    res.json({ success: true, data: faq });
  })
);

/**
 * @openapi
 * /api/faqs/{id}:
 *   delete:
 *     tags: [FAQs]
 *     summary: Deactivate FAQ (moderator only)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: FAQ deactivated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       403:
 *         description: Moderator role required
 */
router.delete(
  '/faqs/:id',
  requireRole('moderator'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseIdParam(req, res);
    if (id === null) return;

    await faqModel.deactivate(id);

    res.json({ success: true, message: 'FAQ deactivated' });
  })
);

// ===========================================
// HELPERS
// ===========================================

function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return formatDate(date);
}

// ===========================================
// ERROR HANDLER
// ===========================================

router.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error('API error', err);

  res.status(500).json({
    success: false,
    error:
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message,
  });
});

export default router;