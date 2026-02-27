

import { Router, Request, Response, NextFunction } from 'express';
import { patientModel, callLogModel, faqModel, appointmentModel } from '../models';
import { getCurrentDate, formatDate } from '../utils/helpers';
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

router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

// ===========================================
// All routes below require authentication
// ===========================================
router.use(authenticate);

// ===========================================
// APPOINTMENTS
// ===========================================

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
// FAQs
// ===========================================

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

router.get(
  '/faqs/categories',
  asyncHandler(async (req: Request, res: Response) => {
    const categories = await faqModel.getCategories();
    res.json({ success: true, data: categories });
  })
);

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