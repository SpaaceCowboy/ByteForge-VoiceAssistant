import {Request, Response, NextFunction } from 'express';
import { z, ZodSchema, ZodError} from 'zod';

//middleware

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

// auth

export const loginSchema = z.object({
    email: z
        .string()
        .email('Invalid email address')
        .max(255),
    password: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(128),
})

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
        .default('user')
})

//appointment 

const appointmentStatusEnum = z.enum([
    'scheduled', 'confirmed', 'checked_in', 'in_progress',
    'completed', 'cancelled', 'no_show', 'reschedueld'
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
    status: appointmentStatusEnum.optional(),
}).refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one field must be provided'}
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
})

//faq

export const faqCreateSchema = z.object({
    questionPattern: z.string().min(1, 'Question pattern is required').max(500),
    questionVariations: z.array(z.string().max(500)).max(20).optional(),
    answer: z.string().min(1, 'Answer is required').max(5000),
    answerShort: z.string().max(500).optional(),
    category: z.string().min(1, 'Category is required').max(100),
    priority: z.number().int().min(0).max(100).optional(),
});

export const faqUpdatedSchema = z.object({
    questionaPattern: z.string().min(1).max(500).optional(),
    questionVariations: z.array(z.string().max(500)).max(20).optional(),
    answer: z.string().min(1).max(5000).optional(),
    answerShort: z.string().max(500).nullable().optional(),
    category: z.string().min(1).max(100).optional(),
    priority: z.number().int().min(0).max(100).optional(),
    isActive:z.boolean().optional(),
}).refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one field must be provided'}
)

//analytics

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

export default {
    validateBody,
    validateQuery,
}