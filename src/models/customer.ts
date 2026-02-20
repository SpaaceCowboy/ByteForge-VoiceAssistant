import db from '../config/database'
import logger from '../utils/logger'
import type { Customer, CustomerWithHistory, Reservation, CallLog} from '../../types/index'

//find a customer by phone or create a new one
export async function findOrCreate(phone: string): Promise<Customer> {
    const existing = await findByPhone(phone);
    if (existing) {
        return existing;
    }

    // create new customer
    const result = await db.query<Customer>(
        'Insert into customers (phone) values ($1) RETURNING *', [phone]
    )

    logger.info('New customer created', {phone})
    return result.rows[0]
}

// find operations

//find by phone number
export async function findByPhone(phone:string): Promise<Customer | null> {
    const result = await db.query<Customer>(
        'Select * from customers WHERE phone = $1',
        [phone]
    )
    return result.rows[0] || null
}

//find customer by id
export async function findById(id: number): Promise<Customer | null> {
    const result = await db.query<Customer>(
        'SELECT * FROM customers WHERE id = $1', [id]
    )
    return result.rows[0] || null
}

//get customer with their reservation history and recent calls
export async function getCustomerWithHistory(
    phone: string
): Promise<CustomerWithHistory | null> {
    const customer = await findByPhone(phone);
    if (!customer) {
        return null
    }

    //get reservations
    const reservationsResult = await db.query<Reservation>(
        `SELECT * FROM reservations
        WHERE customer_id = $1
        ORDER BY reservation_date DESC, reservation_time DESC
        LIMIT 10`,
        [customer.id]
    );

    //get recent calls

    const callsResult = await db.query<CallLog>(
        `SELECT * FROM call_logs
        WHERE customer_id = $1
        ORDER BY started_at DESC
        LIMIT 5`,
        [customer.id] 
    )

    return {
        ...customer,
        reservations: reservationsResult.rows,
        recent_calls: callsResult.rows,
    }
}

//search customers by name or phone
export async function search(query: string, limit: number = 20): Promise<Customer[]> {
    const result = await db.query<Customer>(
        `SELECT * FROM customers
        WHERE phone ILIKE $1
        OR full_name ILIKE $1
        OR email ILIKE $1
        ORDER BY total_reservations DESC LIMIT $2`,
        [`%${query}%`, limit]
    );
    return result.rows
}

//update operations

//update customer information
export async function update(
    id: number,
    data: Partial<Pick<Customer, 'full_name' | 'email' | 'preferred_language' | 'notes'>>
): Promise<Customer | null> {
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

    const result = await db.query<Customer>(
        `UPDATE customers
        SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramIndex}
        RETURNING *`,
        values
    );

    return result.rows[0] || null
}

// update customer name
export async function updateName(id: number, name: string): Promise<Customer | null> {
    return update(id, { full_name: name})
}

//increment the total reservations counter

export async function incrementReservationCount(id: number):  Promise<void> {
    await db.query(
        `UPDATE customers
        SET total_reservations = total_reservations + 1,
        updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
        [id]
    )
}

// add notes to customer record 
export async function addNote(id: number, note: string): Promise<Customer | null> {
    const result = await db.query<Customer>(
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
    getCustomerWithHistory,
    search,
    update,
    updateName,
    incrementReservationCount,
    addNote,
  };