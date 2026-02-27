
import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema, ZodError } from 'zod';

// ===========================================
// GENERIC VALIDATION MIDDLEWARE
// ===========================================

/**
 * Creates middleware that validates req.body against a Zod schema.
 * On failure, returns 400 with structured error details.
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }
      next(error);
    }
  };
}

/**
 * Validates req.query against a Zod schema.
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.query = schema.parse(req.query) as typeof req.query;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: 'Invalid query parameters',
          details: error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }
      next(error);
    }
  };
}

// ===========================================
// SCHEMAS: AUTH
// ===========================================

export const loginSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .max(255),
  password: z
    .string()
    .min(1, 'Password is required')
    .max(128),
});

export const registerSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .max(255),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128),
  fullName: z
    .string()
    .min(1, 'Name is required')
    .max(200),
  role: z
    .enum(['user', 'moderator'])
    .optional()
    .default('user'),
});

// ===========================================
// SCHEMAS: APPOINTMENTS
// ===========================================

const appointmentStatusEnum = z.enum([
  'scheduled', 'confirmed', 'checked_in', 'in_progress',
  'completed', 'cancelled', 'no_show', 'rescheduled',
]);

const appointmentTypeEnum = z.enum([
  'consultation', 'follow_up', 'procedure', 'imaging',
  'urgent_care', 'pre_surgical', 'post_surgical',
  'pain_management', 'therapy',
]);

export const appointmentModifySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .optional(),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM')
    .optional(),
  doctorId: z.number().int().positive().optional(),
  departmentId: z.number().int().positive().optional(),
  locationId: z.number().int().positive().optional(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  appointmentType: appointmentTypeEnum.optional(),
  reasonForVisit: z.string().max(500).optional(),
  specialInstructions: z.string().max(500).optional(),
  status: appointmentStatusEnum.optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided' }
);

export const appointmentCancelSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const appointmentQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .optional(),
  status: appointmentStatusEnum.optional(),
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(200))
    .optional(),
  offset: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(0))
    .optional(),
});

// ===========================================
// SCHEMAS: PATIENTS
// ===========================================

export const patientUpdateSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  email: z.string().email().max(255).optional(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .optional(),
  address: z.string().max(500).optional(),
  insuranceProvider: z.string().max(200).optional(),
  insuranceId: z.string().max(100).optional(),
  emergencyContactName: z.string().max(200).optional(),
  emergencyContactPhone: z.string().max(20).optional(),
  preferredLanguage: z.string().max(10).optional(),
  preferredLocationId: z.number().int().positive().optional(),
  preferredDoctorId: z.number().int().positive().optional(),
  notes: z.string().max(2000).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided' }
);

export const patientSearchSchema = z.object({
  q: z.string().min(1, 'Search query is required').max(200),
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(100))
    .optional(),
});

// ===========================================
// SCHEMAS: CALL LOGS
// ===========================================

export const callsQuerySchema = z.object({
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'start_date must be YYYY-MM-DD')
    .optional(),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'end_date must be YYYY-MM-DD')
    .optional(),
  transferred: z.enum(['true', 'false']).optional(),
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(500))
    .optional(),
});

// ===========================================
// SCHEMAS: FAQs
// ===========================================

export const faqCreateSchema = z.object({
  questionPattern: z.string().min(1, 'Question pattern is required').max(500),
  questionVariations: z.array(z.string().max(500)).max(20).optional(),
  answer: z.string().min(1, 'Answer is required').max(5000),
  answerShort: z.string().max(500).optional(),
  category: z.string().min(1, 'Category is required').max(100),
  priority: z.number().int().min(0).max(100).optional(),
});

export const faqUpdateSchema = z.object({
  questionPattern: z.string().min(1).max(500).optional(),
  questionVariations: z.array(z.string().max(500)).max(20).optional(),
  answer: z.string().min(1).max(5000).optional(),
  answerShort: z.string().max(500).nullable().optional(),
  category: z.string().min(1).max(100).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided' }
);

// ===========================================
// SCHEMAS: ANALYTICS
// ===========================================

export const dateRangeQuerySchema = z.object({
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'start_date must be YYYY-MM-DD')
    .optional(),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'end_date must be YYYY-MM-DD')
    .optional(),
});

// ===========================================
// EXPORTS
// ===========================================

export default {
  validateBody,
  validateQuery,
};