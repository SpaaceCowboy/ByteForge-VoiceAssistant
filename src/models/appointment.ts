import db from '../config/database'
import { generateConfirmationCode } from '../utils/helpers'
import logger from '../utils/logger'
import type {
    Appointment,
    AppointmentCreateInput,
    AppointmentModifyInput,
    AppointmentStatus,
    AvailabilityResult,
    AppointmentStats
} from '../../types/index'

// Check if a time slot is available

export async function checkAvailability(
    date: string,
    time: string,
): Promise<AvailabilityResult> {
    const maxPerSlot = parseInt(process.env.MAX_APPOINTMENTS_PER_SLOT || '3');

    // Check if date is blocked (holidays, clinic closures)
    const blockedResult = await db.query(
        `SELECT reason FROM blocked_times
        WHERE (blocked_date = $1 OR (is_recurring AND
        EXTRACT(MONTH FROM blocked_date) = EXTRACT(MONTH FROM $1::date) AND
        EXTRACT(DAY FROM blocked_date) = EXTRACT(DAY FROM $1::date)))
        AND (start_time IS NULL OR $2::time BETWEEN start_time AND end_time)`,
        [date, time]
    );

    if (blockedResult.rows.length > 0) {
        return {
            available: false,
            reason: blockedResult.rows[0].reason || 'This date/time is not available'
        }
    }

    // Count existing appointments for this slot using a 30-minute window
    const countResult = await db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM appointments
        WHERE appointment_date = $1
        AND appointment_time BETWEEN ($2::time - interval '30 minutes')
                                AND  ($2::time + interval '30 minutes')
        AND status NOT IN ('cancelled', 'no-show')`,
        [date, time]
    )

    const currentBookings = parseInt(countResult.rows[0].count)

    if (currentBookings >= maxPerSlot) {
        // Find alternative slots
        const alternatives = await findAlternativeSlots(date, time, 3);

        return {
            available: false,
            currentBookings,
            maxCapacity: maxPerSlot,
            reason: 'This time slot is fully booked',
            alternativeSlots: alternatives,
        }
    }

    return {
        available: true,
        currentBookings,
        maxCapacity: maxPerSlot,
    }
}

// Find alternative available time slots
async function findAlternativeSlots(
    date: string,
    preferredTime: string,
    count: number,
): Promise<Array<{ date: string; time: string; available: boolean}>> {
    const alternatives: Array<{ date: string; time: string; available: boolean;}> = [];
    const [prefHours, prefMinutes] = preferredTime.split(':').map(Number);
    const openingHour = parseInt(process.env.BUSINESS_OPENING_HOUR?.split(':')[0] || '8');
    const closingHour = parseInt(process.env.BUSINESS_CLOSING_HOUR?.split(':')[0] || '17');

    // Check slots before and after preferred time
    const offsets = [1, -1, 2, -2, 3, -3];

    for (const offset of offsets) {
        if (alternatives.length >= count) break;

        const newHour = prefHours + offset;
        if (newHour >= openingHour && newHour <= closingHour) {
            const newTime = `${newHour.toString().padStart(2, '0')}:${prefMinutes.toString().padStart(2, '0')}`
            const availability = await checkAvailability(date, newTime);

            if (availability.available) {
                alternatives.push({
                    date,
                    time: newTime,
                    available: true,
                })
            }
        }
    }

    return alternatives
}

// Create new appointment
export async function create(input: AppointmentCreateInput): Promise<Appointment> {
    const confirmationCode = generateConfirmationCode()

    const result = await db.query<Appointment>(
        `INSERT INTO appointments (
        patient_id, appointment_date, appointment_time,
        duration_minutes, reason_for_visit, special_instructions,
        provider_name, source, confirmation_code
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
         [
            input.patientId,
            input.date,
            input.time,
            input.durationMinutes || 30,
            input.reasonForVisit || null,
            input.specialInstructions || null,
            input.providerName || null,
            input.source || 'phone_ai',
            confirmationCode,
         ]
    );

    logger.info('Appointment created', {
        id: result.rows[0].id,
        confirmationCode,
        date: input.date,
        time: input.time
    })

    return result.rows[0]
}

// Find appointment by id
export async function findById(id: number): Promise<Appointment | null> {
    const result = await db.query<Appointment>(
        `SELECT a.*, p.full_name as patient_name, p.phone
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        WHERE a.id = $1`,
        [id]
    );
    return result.rows[0] || null
}

// Find appointment by confirmation code
export async function findByConfirmationCode(code: string): Promise<Appointment | null> {
    const result = await db.query<Appointment>(
        `SELECT a.*, p.full_name as patient_name, p.phone
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        WHERE a.confirmation_code = $1`,
        [code.toUpperCase()]
    )
    return result.rows[0] || null
}

// Find upcoming appointments for a patient
export async function findUpcomingByPatient(patientId: number): Promise<Appointment[]> {
    const result = await db.query<Appointment>(
        `SELECT * FROM appointments
        WHERE patient_id = $1
          AND (appointment_date > CURRENT_DATE
               OR (appointment_date = CURRENT_DATE AND appointment_time > CURRENT_TIME))
          AND status NOT IN ('cancelled', 'completed', 'no-show')
        ORDER BY appointment_date, appointment_time
        LIMIT 5`,
        [patientId]
    )
    return result.rows
}

// Find appointments by date
export async function findByDate(date: string): Promise<Appointment[]> {
    const result = await db.query<Appointment>(
        `SELECT a.*, p.full_name as patient_name, p.phone
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        WHERE a.appointment_date = $1
          AND a.status NOT IN ('cancelled')
        ORDER BY a.appointment_time`,
        [date]
    )
    return result.rows;
}

// Find appointments by patient phone (for AI)
export async function findByPatientPhone(phone: string): Promise<Appointment[]> {
    const result = await db.query<Appointment>(
        `SELECT a.* FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        WHERE p.phone = $1
          AND (a.appointment_date > CURRENT_DATE
               OR (a.appointment_date = CURRENT_DATE AND a.appointment_time > CURRENT_TIME))
          AND a.status NOT IN ('cancelled', 'completed', 'no-show')
        ORDER BY a.appointment_date, a.appointment_time`,
        [phone]
    )
    return result.rows
}

// Modify an existing appointment

export async function modify(
    id: number,
    updates: AppointmentModifyInput
): Promise<Appointment | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.date !== undefined) {
        fields.push(`appointment_date = $${paramIndex++}`)
        values.push(updates.date)
    }

    if (updates.time !== undefined) {
        fields.push(`appointment_time = $${paramIndex++}`)
        values.push(updates.time)
    }

    if (updates.reasonForVisit !== undefined) {
        fields.push(`reason_for_visit = $${paramIndex++}`)
        values.push(updates.reasonForVisit)
    }

    if (updates.specialInstructions !== undefined) {
        fields.push(`special_instructions = $${paramIndex++}`);
        values.push(updates.specialInstructions)
    }

    if (updates.providerName !== undefined) {
        fields.push(`provider_name = $${paramIndex++}`)
        values.push(updates.providerName)
    }

    if (updates.durationMinutes !== undefined) {
        fields.push(`duration_minutes = $${paramIndex++}`)
        values.push(updates.durationMinutes)
    }

    if (updates.status !== undefined) {
        fields.push(`status = $${paramIndex++}`)
        values.push(updates.status)
    }

    if (updates.treatmentRoom !== undefined) {
        fields.push(`treatment_room = $${paramIndex++}`)
        values.push(updates.treatmentRoom)
    }

    if (fields.length === 0) {
        return findById(id)
    }

    values.push(id)

    const result = await db.query<Appointment>(
        `UPDATE appointments
        SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramIndex}
        RETURNING *`,
        values
    )

    if (result.rows[0]) {
        logger.info('Appointment modified', {id, updates})
    }

    return result.rows[0] || null
}

// Cancel appointment
export async function cancel(id: number, reason?: string): Promise<Appointment | null> {
    const result = await db.query<Appointment>(
        `UPDATE appointments
        SET status = 'cancelled',
            cancelled_at = CURRENT_TIMESTAMP,
            cancellation_reason = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *`,
        [id, reason || null]
    )

    if (result.rows[0]) {
        logger.info('Appointment cancelled', {id, reason})
    }

    return result.rows[0] || null
}

// Mark appointment as completed (patient showed up)

export async function markCompleted(id: number): Promise<Appointment | null> {
    const result = await db.query<Appointment>(
        `UPDATE appointments
        SET status = 'completed', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *`,
        [id]
    )
    return result.rows[0] || null
}

// Mark appointment as no-show (patient didn't show up)
export async function markNoShow(id: number): Promise<Appointment | null> {
    const result = await db.query<Appointment>(
        `UPDATE appointments
        SET status = 'no-show', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *`,
        [id]
    )
    return result.rows[0] || null
}

// Confirm pending appointment
export async function confirm(id: number): Promise<Appointment | null> {
    const result = await db.query<Appointment>(
        `UPDATE appointments
        SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *`,
        [id]
    )
    return result.rows[0] || null
}

// Statistics

// Get appointment statistics for a date range
export async function getStats(startDate: string, endDate: string): Promise<AppointmentStats> {
    const result = await db.query<AppointmentStats>(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed,
         COUNT(*) FILTER (WHERE status = 'completed') as completed,
         COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
         COUNT(*) FILTER (WHERE status = 'no-show') as no_shows,
         COUNT(*) FILTER (WHERE source = 'phone_ai') as from_ai
       FROM appointments
       WHERE appointment_date BETWEEN $1 AND $2`,
      [startDate, endDate]
    );

    return result.rows[0];
  }


  export default {
    checkAvailability,
    create,
    findById,
    findByConfirmationCode,
    findUpcomingByPatient,
    findByDate,
    findByPatientPhone,
    modify,
    cancel,
    markCompleted,
    markNoShow,
    confirm,
    getStats,
  };
