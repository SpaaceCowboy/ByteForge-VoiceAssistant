/**
 * ===========================================
 * API ROUTES - NEUROSPINE INSTITUTE
 * ===========================================
 *
 * REST API endpoints for the admin dashboard.
 * Provides CRUD for appointments, patients, calls, FAQs,
 * and analytics data.
 *
 */

import { Router, Request, Response, NextFunction } from 'express';
import { patientModel, callLogModel, faqModel, appointmentModel } from '../models';
import { getCurrentDate, formatDate } from '../utils/helpers';
import logger from '../utils/logger';
import type { ApiResponse, PaginatedResponse } from '../../types/index';

const router = Router();

// Error handler wrapper
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ===========================================
// HEALTH CHECK
// ===========================================

router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

// ===========================================
// APPOINTMENTS
// ===========================================

// Get appointments (by date, defaults to today)
router.get(
  '/appointments',
  asyncHandler(async (req: Request, res: Response) => {
    const { date, limit = '50', offset = '0' } = req.query;

    let appointments;

    if (date && typeof date === 'string') {
      appointments = await appointmentModel.findByDate(date);
    } else {
      appointments = await appointmentModel.findByDate(getCurrentDate());
    }

    const response: PaginatedResponse<(typeof appointments)[0]> = {
      success: true,
      data: appointments,
      count: appointments.length,
    };

    res.json(response);
  })
);

// Get a specific appointment
router.get(
  '/appointments/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const appointment = await appointmentModel.findById(id);

    if (!appointment) {
      res.status(404).json({
        success: false,
        error: 'Appointment not found',
      });
      return;
    }

    res.json({
      success: true,
      data: appointment,
    });
  })
);

// Modify an appointment
router.patch(
  '/appointments/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
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
      res.status(404).json({
        success: false,
        error: 'Appointment not found',
      });
      return;
    }

    res.json({
      success: true,
      data: appointment,
    });
  })
);

// Cancel an appointment
router.delete(
  '/appointments/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const { reason } = req.body;

    const appointment = await appointmentModel.cancel(id, reason);

    if (!appointment) {
      res.status(404).json({
        success: false,
        error: 'Appointment not found',
      });
      return;
    }

    res.json({
      success: true,
      data: appointment,
    });
  })
);

// ===========================================
// PATIENTS
// ===========================================

// Search patients by name, phone, or email
router.get(
  '/patients/search',
  asyncHandler(async (req: Request, res: Response) => {
    const { q, limit = '20' } = req.query;

    if (!q || typeof q !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Search query (q) is required',
      });
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

// Get a patient with their appointment/call history
router.get(
  '/patients/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const patient = await patientModel.findById(id);

    if (!patient) {
      res.status(404).json({
        success: false,
        error: 'Patient not found',
      });
      return;
    }

    const patientWithHistory = await patientModel.getPatientWithHistory(
      patient.phone
    );

    res.json({
      success: true,
      data: patientWithHistory,
    });
  })
);

// Update patient info
router.patch(
  '/patients/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
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
      res.status(404).json({
        success: false,
        error: 'Patient not found',
      });
      return;
    }

    res.json({
      success: true,
      data: patient,
    });
  })
);

// ===========================================
// CALL LOGS
// ===========================================

// Get recent call logs
router.get(
  '/calls',
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

// Get a specific call log
router.get(
  '/calls/:callSid',
  asyncHandler(async (req: Request, res: Response) => {
    const callSid = req.params.callSid;
    const call = await callLogModel.findByCallSid(callSid);

    if (!call) {
      res.status(404).json({
        success: false,
        error: 'Call not found',
      });
      return;
    }

    res.json({
      success: true,
      data: call,
    });
  })
);

// ===========================================
// ANALYTICS
// ===========================================

// Get overview statistics
router.get(
  '/analytics/overview',
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

// Get intent breakdown
router.get(
  '/analytics/intents',
  asyncHandler(async (req: Request, res: Response) => {
    const { start_date, end_date } = req.query;

    const startDate = (start_date as string) || getDateDaysAgo(30);
    const endDate = (end_date as string) || getCurrentDate();

    const intents = await callLogModel.getIntentBreakdown(startDate, endDate);

    res.json({
      success: true,
      data: intents,
    });
  })
);

// Get hourly call distribution
router.get(
  '/analytics/hourly',
  asyncHandler(async (req: Request, res: Response) => {
    const { start_date, end_date } = req.query;

    const startDate = (start_date as string) || getDateDaysAgo(7);
    const endDate = (end_date as string) || getCurrentDate();

    const hourly = await callLogModel.getHourlyDistribution(startDate, endDate);

    res.json({
      success: true,
      data: hourly,
    });
  })
);

// ===========================================
// FAQs
// ===========================================

// Get all FAQs (optionally filtered by category)
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

// Get FAQ categories
router.get(
  '/faqs/categories',
  asyncHandler(async (req: Request, res: Response) => {
    const categories = await faqModel.getCategories();

    res.json({
      success: true,
      data: categories,
    });
  })
);

// Create a new FAQ
router.post(
  '/faqs',
  asyncHandler(async (req: Request, res: Response) => {
    const {
      questionPattern,
      questionVariations,
      answer,
      answerShort,
      category,
      priority,
    } = req.body;

    if (!questionPattern || !answer || !category) {
      res.status(400).json({
        success: false,
        error: 'questionPattern, answer, and category are required',
      });
      return;
    }

    const faq = await faqModel.create({
      questionPattern,
      questionVariations,
      answer,
      answerShort,
      category,
      priority,
    });

    res.status(201).json({
      success: true,
      data: faq,
    });
  })
);

// Update a FAQ
router.patch(
  '/faqs/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
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
      res.status(404).json({
        success: false,
        error: 'FAQ not found',
      });
      return;
    }

    res.json({
      success: true,
      data: faq,
    });
  })
);

// Delete (deactivate) a FAQ
router.delete(
  '/faqs/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);

    await faqModel.deactivate(id);

    res.json({
      success: true,
      message: 'FAQ deactivated',
    });
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