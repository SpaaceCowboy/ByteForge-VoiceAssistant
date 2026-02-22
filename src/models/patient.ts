import db from '../config/database'
import logger from '../utils/logger'
import type { Patient, PatientWithHistory, Appointment, CallLog} from '../../types/index'

// Find a patient by phone or create a new one
export async function findOrCreate(phone: string): Promise<Patient> {
    const existing = await findByPhone(phone);
    if (existing) {
        return existing;
    }

    // Create new patient
    const result = await db.query<Patient>(
        'INSERT INTO patients (phone) VALUES ($1) RETURNING *', [phone]
    )

    logger.info('New patient created', {phone})
    return result.rows[0]
}

// Find operations

// Find by phone number
export async function findByPhone(phone: string): Promise<Patient | null> {
    const result = await db.query<Patient>(
        'SELECT * FROM patients WHERE phone = $1',
        [phone]
    )
    return result.rows[0] || null
}

// Find patient by id
export async function findById(id: number): Promise<Patient | null> {
    const result = await db.query<Patient>(
        'SELECT * FROM patients WHERE id = $1', [id]
    )
    return result.rows[0] || null
}

// Get patient with their appointment history and recent calls
export async function getPatientWithHistory(
    phone: string
): Promise<PatientWithHistory | null> {
    const patient = await findByPhone(phone);
    if (!patient) {
        return null
    }

    // Get appointments
    const appointmentsResult = await db.query<Appointment>(
        `SELECT * FROM appointments
        WHERE patient_id = $1
        ORDER BY appointment_date DESC, appointment_time DESC
        LIMIT 10`,
        [patient.id]
    );

    // Get recent calls
    const callsResult = await db.query<CallLog>(
        `SELECT * FROM call_logs
        WHERE patient_id = $1
        ORDER BY started_at DESC
        LIMIT 5`,
        [patient.id]
    )

    return {
        ...patient,
        appointments: appointmentsResult.rows,
        recent_calls: callsResult.rows,
    }
}

// Search patients by name or phone
export async function search(query: string, limit: number = 20): Promise<Patient[]> {
    const result = await db.query<Patient>(
        `SELECT * FROM patients
        WHERE phone ILIKE $1
        OR full_name ILIKE $1
        OR email ILIKE $1
        ORDER BY total_appointments DESC LIMIT $2`,
        [`%${query}%`, limit]
    );
    return result.rows
}

// Update operations

// Update patient information
export async function update(
    id: number,
    data: Partial<Pick<Patient, 'full_name' | 'email' | 'preferred_language' | 'notes'>>
): Promise<Patient | null> {
    const fields: string[] = []
    const values: unknown[] = []
    let paramIndex = 1;

    if (data.full_name !== undefined) {
        fields.push(`full_name = $${paramIndex++}`);
        values.push(data.full_name);
    }

    if (data.email !== undefined) {
        fields.push(`email = $${paramIndex++}`)
        values.push(data.email)
    }

    if (data.preferred_language !== undefined) {
        fields.push(`preferred_language = $${paramIndex++}`)
        values.push(data.preferred_language)
    }

    if (data.notes !== undefined) {
        fields.push(`notes = $${paramIndex++}`)
        values.push(data.notes)
    }

    if (fields.length === 0) {
        return findById(id)
    }

    values.push(id)

    const result = await db.query<Patient>(
        `UPDATE patients
        SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramIndex}
        RETURNING *`,
        values
    );

    return result.rows[0] || null
}

// Update patient name
export async function updateName(id: number, name: string): Promise<Patient | null> {
    return update(id, { full_name: name})
}

// Increment the total appointments counter
export async function incrementAppointmentCount(id: number): Promise<void> {
    await db.query(
        `UPDATE patients
        SET total_appointments = total_appointments + 1,
        updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
        [id]
    )
}

// Add notes to patient record
export async function addNote(id: number, note: string): Promise<Patient | null> {
    const result = await db.query<Patient>(
        `UPDATE patients
        SET notes = CASE
        WHEN notes IS NULL THEN $2
        ELSE notes || E'\n' || $2
        END,
        updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *`,
        [id, `[${new Date().toISOString()}] ${note}`]
    )

    return result.rows[0] || null
}

export default {
    findOrCreate,
    findByPhone,
    findById,
    getPatientWithHistory,
    search,
    update,
    updateName,
    incrementAppointmentCount,
    addNote,
  };
