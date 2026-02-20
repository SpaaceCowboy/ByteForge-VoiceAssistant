import db from '../config/database'
import logger from '../utils/logger'
import type {
    CallLog,
    CallStats,
    IntentBreakdown,
    HourlyDistribution
} from '../../types/index'

//create a new log entry when the call starts
export async function create(
    callSid: string,
    fromNumber: string,
    toNumber: string,
    customerId?: number
): Promise<CallLog> {
    const result = await db.query<CallLog> (
        `INSERT INTO call_logs (call_sid, customer_id, from_number, to_number, status)
        VALUES ($1, $2, $3, $4, in-progress)
        RETURNING *`,
    [callSid, customerId || null,fromNumber, toNumber])
    
    logger.info(`Call log created`, {callSid})
    return result.rows[0]
}

//complete a call log with full detail
export async function completeCall(
    callSid: string,
    data: {
        status: string;
        durationSeconds?: number;
        transcript?: string;
        summary?: string;
        intent?: string,
        sentiment?: string;
        sentimentScore?: number;
        reservationId?: number;
    }
): Promise<CallLog | null> {
    const result = await db.query<CallLog>(
        `UPDATE call_logs SET
        ended_at = CURRENT_TIMESTAMP,
        status = $2,
        duration_seconds = $3,
        transcript = $4,
        summary = $5,
        intent = $6,
        sentiment = $7,
        sentiment_score = $8,
        reservation_id = $9,
        updated_at = CURRENT_TIMESTAMP
      WHERE call_sid = $1
      RETURNING *`,
      [
        callSid,
        data.status,
        data.durationSeconds || null,
        data.transcript || null,
        data.summary || null,
        data.intent || null,
        data.sentiment || null,
        data.sentimentScore || null,
        data.reservationId || null
      ]
    )

    if (result.rows[0]) {
        logger.info('call log complete', {callSid, status: data.status})
    }

    return result.rows[0] || null
}

//append text to the transcript

export async function appendToTranscript(
    callSid: string,
    speaker: 'user' | 'assistant',
    text: string
): Promise<void> {
    const line = `[${speaker.toLocaleUpperCase()}]: ${text}\n`

    await db.query(
        `UPDATE call_logs SET
        transcript = COALESCE(transcript, '') || $2,
        updated_at = CURRENT_TIMESTAMP
        WHERE call_sid = $1`,
        [callSid, line]
    )
}

//mart a call as transferred
export async function markTransferred(
    callSid: string,
    reason: string
): Promise<CallLog | null> {
    const result = await db.query<CallLog>(
        `UPDATE call_logs SET
        was_transferred = true,
        transfer_reason = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE call_sid = $1
      RETURNING *`,
     [callSid, reason]
    )

    return result.rows[0] || null
}

// log errors during a call
export async function logError(
    callSid: string,
    errorMessage: string
): Promise<void> {
    await db.query(
        `UPDATE call_logs SET
        error_message = COALESCE(error_message, '') || $2 || E'\n',
        updated_at = CURRENT_TIMESTAMP
      WHERE call_sid = $1`,
     [callSid, `[${new Date().toISOString()}] ${errorMessage}`]
    )
}

//link a reservation to a call
export async function linkReservation(
    callSid: string,
    reservationId: number
): Promise<void> {
    await db.query(
        `UPDATE call_logs SET
        reservation_id = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE call_sid = $1`,
     [callSid, reservationId]   
    )
} 

//find call log by call SID
export async function findByCallSid(callSid: string): Promise<CallLog | null> {
    const result = await db.query<CallLog>(
      `SELECT cl.*, c.full_name as customer_name
       FROM call_logs cl
       LEFT JOIN customers c ON cl.customer_id = c.id
       WHERE cl.call_sid = $1`,
      [callSid]
    );
    return result.rows[0] || null;
  }

//find calls by customer ID
export async function findByCustomer(
    customerId: number,
    limit: number ,
): Promise<CallLog[]> {
    const result = await db.query<CallLog>(
        `SELECT * FROM call_logs
        WHERE customer_id = $1
        ORDER BY started_at DESC
        LIMIT $2`,
       [customerId, limit]
    )
    return result.rows;
}

//find recent calls within a date range
export async function findRecent(
  startDate: string,
  endDate: string,
  limit: number = 50
): Promise<CallLog[]> {
  const result = await db.query<CallLog>(
      `SELECT cl.*, c.full_name as customer_name
      FROM call_logs cl
      LEFT JOIN customers c ON cl.customer_id = c.id
      WHERE cl.started_at BETWEEN $1 AND $2
      ORDER BY cl.started_at DESC
      LIMIT $3`,
     [startDate, endDate, limit]
  )
  return result.rows
}

//find transferred calls (for review)
export async function findTransferredCalls(
    startDate: string,
    endDate: string
): Promise<CallLog[]> {
    const result = await db.query<CallLog>(
        `SELECT cl.*, c.full_name as customer_name
        FROM call_logs cl
        LEFT JOIN customers c ON cl.customer_id = c.id
        WHERE cl.was_transferred = true
          AND cl.started_at BETWEEN $1 AND $2
        ORDER BY cl.started_at DESC`,
       [startDate, endDate]
    )
    return result.rows
}

// find calls with errors
export async function findCallsWithErrors(
    startDate: string,
    endDate: string
): Promise<CallLog[]> {
    const result = await db.query<CallLog>(
        `SELECT cl.*, c.full_name as customer_name
        FROM call_logs cl
        LEFT JOIN customers c ON cl.customer_id = c.id
        WHERE cl.error_message IS NOT NULL
          AND cl.started_at BETWEEN $1 AND $2
        ORDER BY cl.started_at DESC`,
       [startDate, endDate]
    )
    return result.rows
}

//get call statistics for a date range
export async function getStats(
    startDate: string,
    endDate: string
  ): Promise<CallStats> {
    const result = await db.query<CallStats>(
      `SELECT 
         COUNT(*) as total_calls,
         COUNT(*) FILTER (WHERE status = 'completed') as completed_calls,
         AVG(duration_seconds) FILTER (WHERE duration_seconds IS NOT NULL) as avg_duration,
         COUNT(*) FILTER (WHERE was_transferred = true) as transferred_calls,
         COUNT(*) FILTER (WHERE error_message IS NOT NULL) as calls_with_errors
       FROM call_logs
       WHERE started_at BETWEEN $1 AND $2`,
      [startDate, endDate]
    );
    
    return result.rows[0];
  }

  // get intent breakdown

  export async function getIntentBreakdown(
    startDate: string,
    endDate: string
  ): Promise<IntentBreakdown[]> {
    const result = await db.query<IntentBreakdown>(
      `SELECT 
         intent,
         COUNT(*) as count,
         ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
       FROM call_logs
       WHERE started_at BETWEEN $1 AND $2
         AND intent IS NOT NULL
       GROUP BY intent
       ORDER BY count DESC`,
      [startDate, endDate]
    );
    
    return result.rows;
  }

  //get hourly call distribution

  export async function getHourlyDistribution(
    startDate: string,
    endDate: string
  ): Promise<HourlyDistribution[]> {
    const result = await db.query<HourlyDistribution>(
      `SELECT 
         EXTRACT(HOUR FROM started_at) as hour,
         COUNT(*) as call_count
       FROM call_logs
       WHERE started_at BETWEEN $1 AND $2
       GROUP BY hour
       ORDER BY hour`,
      [startDate, endDate]
    );
    
    return result.rows;
  }

  //get average sentiment by day
  export async function getSentimentTrend(
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; avg_sentiment: number; call_count: number }>> {
    const result = await db.query(
      `SELECT 
         DATE(started_at) as date,
         AVG(sentiment_score) as avg_sentiment,
         COUNT(*) as call_count
       FROM call_logs
       WHERE started_at BETWEEN $1 AND $2
         AND sentiment_score IS NOT NULL
       GROUP BY DATE(started_at)
       ORDER BY date`,
      [startDate, endDate]
    );
    return result.rows
  }

  export default {
    create,
    completeCall,
    appendToTranscript,
    markTransferred,
    logError,
    linkReservation,
    findByCallSid,
    findByCustomer,
    findRecent,
    findTransferredCalls,
    findCallsWithErrors,
    getStats,
    getIntentBreakdown,
    getHourlyDistribution,
    getSentimentTrend,
  };