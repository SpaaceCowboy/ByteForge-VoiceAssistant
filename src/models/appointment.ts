import db from '../config/database'
import { generateConfirmationCode } from '../utils/helpers'
import logger from '../utils/logger'
import type {
    Appointment,
    AppointmentCreateInput,
    AppointmentModifyInput,
    AppointmentStats,
    AvailabilityResult,
} from '../../types/index'

//Check if a time slot is available

export async function checkAvailability(
    date: string,
    time: string,
    doctorId?: number,
    locationId?: number
): Promise<AvailabilityResult> {
    const maxPerSlot = parseInt(process.env.MAX_APPOINTMENTS_PER_SLOT || '3');

    //check if date is blocked (holidays, events)
    const blockedQuery = doctorId
        ? `SELECT reason FROM blocked_times
        WHERE blocked_date = $1
          AND (doctor_id = $2 OR doctor_id IS NULL)
          AND (start_time IS NULL OR $3::time BETWEEN start_time AND end_time)`
     : `SELECT reason FROM blocked_times
        WHERE blocked_date = $1
          AND doctor_id IS NULL
          AND (start_time IS NULL OR $2::time BETWEEN start_time AND end_time)`;

    const blockedParams = doctorId ? [date, doctorId, time] : [date, time];
    const blockedResult = await db.query(blockedQuery, blockedParams);

    if (blockedResult.rows.length > 0) {
        return {
            available: false,
            reason: 
            blockedResult.rows[0].reason || 'This date/time is not available'
        }
    }

    //counting existing reservations for this slot using a 30 minutes windows
    let countQuery = `
    SELECT COUNT(*) as count FROM appointments
    WHERE appointment_date = $1
      AND appointment_time BETWEEN ($2::time - interval '15 minutes')
                                AND ($2::time + interval '15 minutes')
      AND status NOT IN ('cancelled', 'no_show', 'rescheduled')`;
  const countParams: unknown[] = [date, time];

  if (doctorId) {
    countQuery += ` AND doctor_id = $${countParams.length + 1}`;
    countParams.push(doctorId);
  }

  if (locationId) {
    countQuery += ` AND location_id = $${countParams.length + 1}`;
    countParams.push(locationId);
  }

  const countResult = await db.query<{ count: string }>(
    countQuery,
    countParams
  );
  const currentBookings = parseInt(countResult.rows[0].count);

  if (currentBookings >= maxPerSlot) {
    // Find alternative slots
    const alternatives = await findAlternativeSlots(
      date,
      time,
      3,
      doctorId,
      locationId
    );

    return {
      available: false,
      currentBookings,
      maxCapacity: maxPerSlot,
      reason: 'This time slot is fully booked',
      alternativeSlots: alternatives,
    };
  }

  return {
    available: true,
    currentBookings,
    maxCapacity: maxPerSlot,
  };
}

//find alternative available time slots near preferred time
async function findAlternativeSlots(
    date: string,
    preferredTime: string,
    count: number,
    doctorId?: number,
    locationId?: number
  ): Promise<
    Array<{ date: string; time: string; available: boolean }>
  > {
    const alternatives: Array<{
      date: string;
      time: string;
      available: boolean;
    }> = [];
    const [prefHours, prefMinutes] = preferredTime.split(':').map(Number);
    const openingHour = parseInt(
      process.env.BUSINESS_OPENING_HOUR?.split(':')[0] || '8'
    );
    const closingHour = parseInt(
      process.env.BUSINESS_CLOSING_HOUR?.split(':')[0] || '16'
    );
  
    // Check slots before and after preferred time
    const offsets = [1, -1, 2, -2, 3, -3];
  
    for (const offset of offsets) {
      if (alternatives.length >= count) break;
  
      const newHour = prefHours + offset;
      if (newHour >= openingHour && newHour <= closingHour) {
        const newTime = `${newHour.toString().padStart(2, '0')}:${prefMinutes
          .toString()
          .padStart(2, '0')}`;
        const availability = await checkAvailability(
          date,
          newTime,
          doctorId,
          locationId
        );
  
        if (availability.available) {
          alternatives.push({
            date,
            time: newTime,
            available: true,
          });
        }
      }
    }
  
    return alternatives;
  }

//create new appointment
export async function create(
    input: AppointmentCreateInput
  ): Promise<Appointment> {
    const confirmationCode = generateConfirmationCode();
  
    const result = await db.query<Appointment>(
      `INSERT INTO appointments (
         patient_id, doctor_id, department_id, location_id,
         appointment_date, appointment_time, duration_minutes,
         appointment_type, reason_for_visit, special_instructions,
         is_new_patient, referral_required, referral_source,
         source, confirmation_code
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        input.patientId,
        input.doctorId || null,
        input.departmentId || null,
        input.locationId || null,
        input.date,
        input.time,
        input.durationMinutes || 30,
        input.appointmentType || 'consultation',
        input.reasonForVisit || null,
        input.specialInstructions || null,
        input.isNewPatient || false,
        input.referralRequired || false,
        input.referralSource || null,
        input.source || 'phone_ai',
        confirmationCode,
      ]
    );
  
    logger.info('Appointment created', {
      id: result.rows[0].id,
      confirmationCode,
      date: input.date,
      time: input.time,
      doctorId: input.doctorId,
    });
  
    return result.rows[0];
  }

//find reservation by id
export async function findById(id: number): Promise<Appointment | null> {
    const result = await db.query<Appointment>(
      `SELECT a.*,
         p.full_name AS patient_name, p.phone AS patient_phone,
         p.insurance_provider,
         d.full_name AS doctor_name, d.title AS doctor_title,
         dep.name AS department_name,
         l.name AS location_name
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       LEFT JOIN doctors d ON a.doctor_id = d.id
       LEFT JOIN departments dep ON a.department_id = dep.id
       LEFT JOIN locations l ON a.location_id = l.id
       WHERE a.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  // Find appointment by confirmation code. 
export async function findByConfirmationCode(
    code: string
  ): Promise<Appointment | null> {
    const result = await db.query<Appointment>(
      `SELECT a.*,
         p.full_name AS patient_name, p.phone AS patient_phone,
         p.insurance_provider,
         d.full_name AS doctor_name, d.title AS doctor_title,
         dep.name AS department_name,
         l.name AS location_name
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       LEFT JOIN doctors d ON a.doctor_id = d.id
       LEFT JOIN departments dep ON a.department_id = dep.id
       LEFT JOIN locations l ON a.location_id = l.id
       WHERE a.confirmation_code = $1`,
      [code.toUpperCase()]
    );
    return result.rows[0] || null;
  }

// upcoming reservations for a customer
export async function findUpcomingByPatient(
    patientId: number
  ): Promise<Appointment[]> {
    const result = await db.query<Appointment>(
      `SELECT a.*,
         d.full_name AS doctor_name, d.title AS doctor_title,
         dep.name AS department_name,
         l.name AS location_name
       FROM appointments a
       LEFT JOIN doctors d ON a.doctor_id = d.id
       LEFT JOIN departments dep ON a.department_id = dep.id
       LEFT JOIN locations l ON a.location_id = l.id
       WHERE a.patient_id = $1
         AND (a.appointment_date > CURRENT_DATE
              OR (a.appointment_date = CURRENT_DATE AND a.appointment_time > CURRENT_TIME))
         AND a.status NOT IN ('cancelled', 'completed', 'no_show', 'rescheduled')
       ORDER BY a.appointment_date, a.appointment_time
       LIMIT 5`,
      [patientId]
    );
    return result.rows;
  }

//find reservation by date (front)
export async function findByDate(date: string): Promise<Appointment[]> {
    const result = await db.query<Appointment>(
      `SELECT a.*,
         p.full_name AS patient_name, p.phone AS patient_phone,
         d.full_name AS doctor_name, d.title AS doctor_title,
         dep.name AS department_name,
         l.name AS location_name
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       LEFT JOIN doctors d ON a.doctor_id = d.id
       LEFT JOIN departments dep ON a.department_id = dep.id
       LEFT JOIN locations l ON a.location_id = l.id
       WHERE a.appointment_date = $1
         AND a.status NOT IN ('cancelled')
       ORDER BY a.appointment_time`,
      [date]
    );
    return result.rows;
  }

//find reservation by customer phone (for ai)
export async function findByPatientPhone(
    phone: string
  ): Promise<Appointment[]> {
    const result = await db.query<Appointment>(
      `SELECT a.*,
         d.full_name AS doctor_name, d.title AS doctor_title,
         dep.name AS department_name,
         l.name AS location_name
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       LEFT JOIN doctors d ON a.doctor_id = d.id
       LEFT JOIN departments dep ON a.department_id = dep.id
       LEFT JOIN locations l ON a.location_id = l.id
       WHERE p.phone = $1
         AND (a.appointment_date > CURRENT_DATE
              OR (a.appointment_date = CURRENT_DATE AND a.appointment_time > CURRENT_TIME))
         AND a.status NOT IN ('cancelled', 'completed', 'no_show', 'rescheduled')
       ORDER BY a.appointment_date, a.appointment_time`,
      [phone]
    );
    return result.rows;
  }

//modify an existing reservation

export async function modify(
    id: number,
    updates: AppointmentModifyInput
  ): Promise<Appointment | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;
  
    const fieldMap: Array<[keyof AppointmentModifyInput, string]> = [
      ['date', 'appointment_date'],
      ['time', 'appointment_time'],
      ['doctorId', 'doctor_id'],
      ['departmentId', 'department_id'],
      ['locationId', 'location_id'],
      ['durationMinutes', 'duration_minutes'],
      ['appointmentType', 'appointment_type'],
      ['reasonForVisit', 'reason_for_visit'],
      ['specialInstructions', 'special_instructions'],
      ['status', 'status'],
    ];
  
    for (const [key, column] of fieldMap) {
      if (updates[key] !== undefined) {
        fields.push(`${column} = $${paramIndex++}`);
        values.push(updates[key]);
      }
    }
  
    if (fields.length === 0) {
      return findById(id);
    }
  
    values.push(id);
  
    const result = await db.query<Appointment>(
      `UPDATE appointments
       SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );
  
    if (result.rows[0]) {
      logger.info('Appointment modified', { id, updates });
    }
  
    return result.rows[0] || null;
  }

//cancle reservation-
export async function cancel(
    id: number,
    reason?: string
  ): Promise<Appointment | null> {
    const result = await db.query<Appointment>(
      `UPDATE appointments
       SET status = 'cancelled',
           cancelled_at = CURRENT_TIMESTAMP,
           cancellation_reason = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id, reason || null]
    );
  
    if (result.rows[0]) {
      logger.info('Appointment cancelled', { id, reason });
    }
  
    return result.rows[0] || null;
  }

//mark reservation as complete (customer showed up)

export async function markCompleted(
    id: number
  ): Promise<Appointment | null> {
    const result = await db.query<Appointment>(
      `UPDATE appointments
       SET status = 'completed', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  }

// mark reservation as no-sho ( didnt show up)
export async function markNoShow(
    id: number
  ): Promise<Appointment | null> {
    const result = await db.query<Appointment>(
      `UPDATE appointments
       SET status = 'no_show', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  }

//confirm pending reservation
export async function confirm(
    id: number
  ): Promise<Appointment | null> {
    const result = await db.query<Appointment>(
      `UPDATE appointments
       SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  }

//  STATICS

//get reservation statistics for a date range
export async function getStats(
    startDate: string,
    endDate: string
  ): Promise<AppointmentStats> {
    const result = await db.query<AppointmentStats>(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
         COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed,
         COUNT(*) FILTER (WHERE status = 'completed') as completed,
         COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
         COUNT(*) FILTER (WHERE status = 'no_show') as no_shows,
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
  