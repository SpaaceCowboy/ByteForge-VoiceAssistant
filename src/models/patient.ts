import db from '../config/database'
import logger from '../utils/logger'
import type { Patient, PatientWithHistory, Appointment, CallLog} from '../../types/index'

//find a patient by phone or create a new one
export async function findOrCreate(phone: string): Promise<Patient> {
    const existing = await findByPhone(phone);
    if (existing) {
        return existing;
    }

    // create new patient
    const result = await db.query<Patient>(
        'Insert into patients (phone) values ($1) RETURNING *', [phone]
    )

    logger.info('New patient created', {phone})
    return result.rows[0]
}

// find operations

//find by phone number
export async function findByPhone(phone:string): Promise<Patient | null> {
    const result = await db.query<Patient>(
        'Select * FROM patients WHERE phone = $1',
        [phone]
    )
    return result.rows[0] || null
}

//find patient by id
export async function findById(id: number): Promise<Patient | null> {
    const result = await db.query<Patient>(
        'SELECT * FROM patients WHERE id = $1', [id]
    )
    return result.rows[0] || null
}

//get patient with their appoinment history and recent calls
export async function getPatientWithHistory(
    phone: string
): Promise<PatientWithHistory | null> {
    const patient = await findByPhone(phone);
    if (!patient) {
        return null
    }

    //get appointment
    const reservationsResult = await db.query<Appointment>(
        `SELECT a.*,
        d.full_name AS doctor_name, d.title AS doctor_title,
        dep.name AS department_name,
        1.name AS location_name,
        FROM appointments a
        LEFT JOIN doctors d ON a.doctor_id = dep.id
        LEFT JOIN departments dep ON a.department_id = deep.id
        LEFT JOIN locations 1 ON a.location_id = 1.id
        WHERE a.patient_id = $1
        ORDER BY a.appointment_date DESC, a.appointment_time DESC
        LIMIT 10`,
        [patient.id]
    );

    //get recent calls

    const callsResult = await db.query<CallLog>(
        `SELECT * FROM call_logs
         WHERE patient_id = $1
         ORDER BY started_at DESC
         LIMIT 5`,
        [patient.id]
      );

    return {
        ...patient,
        appointments: reservationsResult.rows,
        recent_calls: callsResult.rows,
    }
}

//search patients by name or phone
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

//update operations

//update patient information
export async function update(
    id: number,
    data: Partial<Pick<
    Patient, 'full_name' 
    | 'email' 
    | 'date_of_birth' 
    | 'preferred_language' 
    | 'notes'
    | 'address'
    | 'insurance_provider' 
    | 'insurance_id'
    | 'emergency_contact_name' 
    | 'emergency_contact_phone'
    | 'preferred_doctor_id'
    | 'preferred_location_id'>>
): Promise<Patient | null> {
    const fields: string[] = []
    const values: unknown[] = []
    let paramIndex = 1;

    const fieldMap: Array<[keyof typeof data, string]> = [
        ['full_name', 'full_name'],
        ['email', 'email'],
        ['date_of_birth', 'date_of_birth'],
        ['address', 'address'],
        ['insurance_provider', 'insurance_provider'],
        ['insurance_id', 'insurance_id'],
        ['emergency_contact_name', 'emergency_contact_name'],
        ['emergency_contact_phone', 'emergency_contact_phone'],
        ['preferred_language', 'preferred_language'],
        ['preferred_location_id', 'preferred_location_id'],
        ['preferred_doctor_id', 'preferred_doctor_id'],
        ['notes', 'notes'],
      ];

      for (const [key, column] of fieldMap) {
        if (data[key] !== undefined) {
          fields.push(`${column} = $${paramIndex++}`);
          values.push(data[key]);
        }
      }
    
      if (fields.length === 0) {
        return findById(id);
      }
    
      values.push(id);
    
      const result = await db.query<Patient>(
        `UPDATE patients
         SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $${paramIndex}
         RETURNING *`,
        values
      );
    
      return result.rows[0] || null;
    }

// update patient name
export async function updateName(
    id: number,
    name: string
): Promise<Patient | null> {
    return update(id, { full_name: name})
}

//update insurance information
export async function updateInsurance(
    id: number,
    provider: string,
    insuranceId?: string,
): Promise<Patient | null> {
    return update(id, {
        insurance_provider: provider,
        ...(insuranceId ? {insurance_id: insuranceId} : {}),
    })
}

//increment the total reservations counter 
export async function incrementAppointmentCount(id: number):  Promise<void> {
    await db.query(
        `UPDATE customers
        SET total_reservations = total_reservations + 1,
        updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
        [id]
    )
}

// add notes to patient record 
export async function addNote(id: number, note: string): Promise<Patient | null> {
    const result = await db.query<Patient>(
        `UPDATE customers
        SET notes = CASE 
        WHEN notes IS NULL THEN $2
        ELSE NOTES || E'\n' || $2
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
  updateInsurance,
  incrementAppointmentCount,
  addNote,
};