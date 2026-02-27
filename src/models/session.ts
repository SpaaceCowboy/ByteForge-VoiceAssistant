import { query } from '../config/database';
import logger from '../utils/logger';

export async function upsertSession(
  callSid: string,
  state: object,
  messageHistory: object[],
  collectedData: object,
  isActive: boolean
): Promise<void> {
  await query(
    `INSERT INTO conversation_sessions (call_sid, state, message_history, collected_data, is_active)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (call_sid) DO UPDATE SET
       state = $2,
       message_history = $3,
       collected_data = $4,
       is_active = $5,
       updated_at = CURRENT_TIMESTAMP`,
    [callSid, JSON.stringify(state), JSON.stringify(messageHistory), JSON.stringify(collectedData), isActive]
  );
}

export async function markInactive(callSid: string): Promise<void> {
  await query(
    'UPDATE conversation_sessions SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE call_sid = $1',
    [callSid]
  );
}

export async function deleteOldSessions(olderThanHours: number = 24): Promise<number> {
  const result = await query(
    `DELETE FROM conversation_sessions
     WHERE is_active = FALSE
       AND updated_at < NOW() - INTERVAL '1 hour' * $1
     RETURNING id`,
    [olderThanHours]
  );
  const count = result.rowCount ?? 0;
  if (count > 0) {
    logger.info(`Cleaned up ${count} old conversation sessions`);
  }
  return count;
}

export async function getSessionStats(): Promise<{
  total: number;
  active: number;
  inactive: number;
  oldestInactive: string | null;
}> {
  const result = await query<{
    total: string;
    active: string;
    inactive: string;
    oldest_inactive: string | null;
  }>(
    `SELECT
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE is_active = TRUE) as active,
       COUNT(*) FILTER (WHERE is_active = FALSE) as inactive,
       MIN(updated_at) FILTER (WHERE is_active = FALSE) as oldest_inactive
     FROM conversation_sessions`
  );
  const row = result.rows[0];
  return {
    total: parseInt(row.total),
    active: parseInt(row.active),
    inactive: parseInt(row.inactive),
    oldestInactive: row.oldest_inactive,
  };
}

export default {
  upsertSession,
  markInactive,
  deleteOldSessions,
  getSessionStats,
};
