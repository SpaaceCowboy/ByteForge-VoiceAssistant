import db from '../config/database'
import { generateConfirmationCode } from '../utils/helpers'
import logger from '../utils/logger'
import type {
    Reservation,
    ReservationCreateInput,
    ReservationModifyInput,
    ReservationStatus,
    AvailabilityResult,
    ReservationStats
} from '../../index'

//Check if a time slot is available

export async function checkAvailability(
    date: string,
    time: string,
    partySize: number
): Promise<AvailabilityResult> {
    const maxPerSlot = parseInt(process.env.MAX_RESERVATIONS_PER_SLOT || '2');

    //check if date is blocked (holidays, events)
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
            reason: blockedResult.rows[0].reason || 'this date/time is not available'
        }
    }

    //counting existing reservations for this slot using a 1-hour windows
    const countResult = await db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM reservations
        WHERE reservation_date = $1
        AND reservation_time BETWEEN ($2::time - interval '30 minutes')
                                AND  ($2::time + interval '30 minutes')
        AND status NOT IN ('cancelled', 'no-show')`,
        [date, time]
    )

    const currentBookings = parseInt(countResult.rows[0].count)

    if (currentBookings >= maxPerSlot) {
        //find alternative slots
        const alternatives = await findAlternativeSlots(date, time, 3, partySize);

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

//find alternative available time slots
async function findAlternativeSlots(
    date:string,
    preferredTime: string,
    count: number,
    partySize: number,
): Promise<Array<{ date: string; time: string; available: boolean}>> {
    const alternatives: Array<{ date: string; time: string; available: boolean;}> = [];
    const [prefHours, prefMinutes] = preferredTime.split(':').map(Number);
    const openingHour = parseInt(process.env.BUSINESS_OPENING_HOUR?.split(':')[0] || '8');
    const closingHour = parseInt(process.env.BUSINESS_CLOSING_HOUR?.split(':')[0] || '16');

    //CHECK SLOTS BEFORE AND AFTER PREFERRED TIME
    const offsets = [1, -1, 2, -2, 3, -3];

    for (const offset of offsets) {
        if (alternatives.length >= count) break;

        const newHour = prefHours + offset;
        if (newHour >= openingHour && newHour <= closingHour) {
            const newTime = `${newHour.toString().padStart(2, '0')}:${prefMinutes.toString().padStart(2, '0')}`
            const availability = await checkAvailability(date, newTime, partySize);

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

//create new reservation
export async function create(input: ReservationCreateInput): Promise<Reservation>{
    const confirmationCode = generateConfirmationCode()

    const result = await db.query<Reservation>(
        `INSERT INTO reservations (
        customer_id, reservation_date, reservation_time,
        party_size, special_requests, source, confirmation_code
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
         [
            input.customerId,
            input.date,
            input.time,
            input.partySize,
            input.specialRequests || null,
            input.source || 'phone_ai',
            confirmationCode,
         ]
    );

    logger.info('Reservation created', {
        id: result.rows[0].id,
        confirmationCode,
        date: input.date,
        time: input.time
    })

    return result.rows[0]
}

//find reservation by id
export async function findById(id: number): Promise<Reservation | null> {
    const result = await db.query<Reservation>(
        `SELECT r.*, c.full_name as customer_name, c.phone
        FROM reservations r
        JOIN customers c ON r.customer_id = c.id
        WHERE r.id = $1`,
        [id]
    );
    return result.rows[0] || null
}

//find reservation by confirmation code
export async function findByConfirmationCode(code: string): Promise<Reservation | null> {
    const result = await db.query<Reservation>(
        `SELECT r.*, c.full_name as customer_name, c.phone
        FROM reservations r
        JOIN customers c ON r.customer_id = c.id
        WHERE r.confirmation_code = $1`,
        [code.toUpperCase()]
    )
    return result.rows[0] || null
}

//find upcoming reservations for a customer
export async function findUpcomingByCustomer(customerId: number): Promise<Reservation[]> {
    const result = await db.query<Reservation>(
        `SELECT * FROM reservations 
        WHERE customer_id = $1 
          AND (reservation_date > CURRENT_DATE 
               OR (reservation_date = CURRENT_DATE AND reservation_time > CURRENT_TIME))
          AND status NOT IN ('cancelled', 'completed', 'no-show')
        ORDER BY reservation_date, reservation_time
        LIMIT 5`,
        [customerId]
    )
    return result.rows
}

//find reservation by date
export async function findByDate(date: string): Promise<Reservation[]> {
    const result = await db.query<Reservation>(
        `SELECT r.*, c.full_name as customer_name, c.phone
        FROM reservations r
        JOIN customers c ON r.customer_id = c.id
        WHERE r.reservation_date = $1
          AND r.status NOT IN ('cancelled')
        ORDER BY r.reservation_time`,
        [date]
    )
    return result.rows;
}

//find reservation by customer phone (for ai)
export async function findByCustomerPhone(phone: string): Promise<Reservation[]> {
    const result = await db.query<Reservation>(
        `SELECT r.* FROM reservations r
        JOIN customers c ON r.customer_id = c.id
        WHERE c.phone = $1
          AND (r.reservation_date > CURRENT_DATE 
               OR (r.reservation_date = CURRENT_DATE AND r.reservation_time > CURRENT_TIME))
          AND r.status NOT IN ('cancelled', 'completed', 'no-show')
        ORDER BY r.reservation_date, r.reservation_time`,
        [phone]  
    )
    return result.rows
}

//modify an existing reservation

export async function modify(
    id: number,
    updates: ReservationModifyInput
): Promise<Reservation | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.date !== undefined) {
        fields.push(`reservation_date = $${paramIndex++}`)
        values.push(updates.date)
    }

    if (updates.time !== undefined) {
        fields.push(`reservation_time = $${paramIndex++}`)
        values.push(updates.time)
    }

    if (updates.partySize !== undefined) {
        fields.push(`party_size = $${paramIndex++}`)
        values.push(updates.partySize)
    }

    if (updates.specialRequests !== undefined) {
        fields.push(`special_requests = $${paramIndex++}`);
        values.push(updates.specialRequests)
    }

    if (updates.status !== undefined) {
        fields.push(`status = $${paramIndex++}`)
        values.push(updates.status)
    }

    if (updates.tableNumber !== undefined) {
        fields.push(`table_number = $${paramIndex++}`)
        values.push(updates.tableNumber)
    }

    if (fields.length === 0) {
        return findById(id)
    }

    values.push(id)

    const result = await db.query<Reservation>(
        `UPDATE reservations 
        SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP 
        WHERE id = $${paramIndex} 
        RETURNING *`,
        values
    )

    if (result.rows[0]) {
        logger.info('reservation modified', {id, updates})
    }

    return result.rows[0] || null
}

//cancel reservation
export async function cancel(id: number, reason?: string): Promise<Reservation | null> {
    const result = await db.query<Reservation>(
        `UPDATE reservations 
        SET status = 'cancelled',
            cancelled_at = CURRENT_TIMESTAMP,
            cancellation_reason = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *`,
        [id, reason || null]
    )

    if (result.rows[0]) {
        logger.info('Reservation cancelled', {id, reason})
    }

    return result.rows[0] || null
}

//mark reservation as complete (customer showed up)

export async function markCompleted(id: number): Promise<Reservation | null> {
    const result = await db.query<Reservation>(
        `UPDATE reservations 
        SET status = 'completed', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *`,
        [id]
    )
    return result.rows[0] || null
}

// mark reservation as no-show (didn't show up)
export async function markNoShow(id: number): Promise<Reservation | null> {
    const result = await  db.query<Reservation> (
        `UPDATE reservations 
        SET status = 'no-show', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *`,
        [id] 
    )
    return result.rows[0] || null
}

//confirm pending reservation
export async function confirm(id: number): Promise<Reservation | null> {
    const result = await db.query<Reservation> (
        `UPDATE reservations 
        SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *`, 
        [id]
    )
    return result.rows[0] || null
}

//  STATISTICS

//get reservation statistics for a date range
export async function getStats(startDate: string, endDate: string): Promise<ReservationStats> {
    const result = await db.query<ReservationStats>(
      `SELECT 
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed,
         COUNT(*) FILTER (WHERE status = 'completed') as completed,
         COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
         COUNT(*) FILTER (WHERE status = 'no-show') as no_shows,
         COUNT(*) FILTER (WHERE source = 'phone_ai') as from_ai
       FROM reservations
       WHERE reservation_date BETWEEN $1 AND $2`,
      [startDate, endDate]
    );
    
    return result.rows[0];
  }


  export default {
    checkAvailability,
    create,
    findById,
    findByConfirmationCode,
    findUpcomingByCustomer,
    findByDate,
    findByCustomerPhone,
    modify,
    cancel,
    markCompleted,
    markNoShow,
    confirm,
    getStats,
  };
  