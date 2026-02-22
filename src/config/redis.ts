import { Redis } from '@upstash/redis';
import logger from '../utils/logger';
import type { Session, Message, SessionState, CollectedData } from '../../types/index';

// Upstash Redis client
const client = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Session constants
const SESSION_PREFIX = 'session:';
const SESSION_TTL = 3600; // 1 hour

// Session functions
export async function setSession(callSid: string, session: Session): Promise<void> {
  const key = `${SESSION_PREFIX}${callSid}`;
  await client.setex(key, SESSION_TTL, JSON.stringify(session));
  logger.debug('Session saved', { callSid });
}

export async function getSession(callSid: string): Promise<Session | null> {
  const key = `${SESSION_PREFIX}${callSid}`;
  const data = await client.get(key);

  if (!data) {
    return null;
  }

  try {
    return typeof data === 'string' ? JSON.parse(data) : data as Session;
  } catch (error) {
    logger.error('Failed to parse session', { callSid, error });
    return null;
  }
}

export async function updateSession(
  callSid: string,
  updates: Partial<Session>
): Promise<Session | null> {
  const session = await getSession(callSid);

  if (!session) {
    logger.warn('Cannot update non-existent session', { callSid });
    return null;
  }

  const updatedSession: Session = {
    ...session,
    ...updates,
  };

  await setSession(callSid, updatedSession);
  return updatedSession;
}

export async function updateSessionState(
  callSid: string,
  stateUpdates: Partial<SessionState>
): Promise<Session | null> {
  const session = await getSession(callSid);

  if (!session) {
    return null;
  }

  const updatedSession: Session = {
    ...session,
    state: {
      ...session.state,
      ...stateUpdates,
    },
  };

  await setSession(callSid, updatedSession);
  return updatedSession;
}

export async function updateCollectedData(
  callSid: string,
  dataUpdates: Partial<CollectedData>
): Promise<Session | null> {
  const session = await getSession(callSid);

  if (!session) {
    return null;
  }

  const updatedSession: Session = {
    ...session,
    collectedData: {
      ...session.collectedData,
      ...dataUpdates,
    },
  };

  await setSession(callSid, updatedSession);
  return updatedSession;
}

export async function addMessage(callSid: string, message: Message): Promise<void> {
  const session = await getSession(callSid);

  if (!session) {
    logger.warn('Cannot add message to non-existent session', { callSid });
    return;
  }

  session.messageHistory.push(message);
  await setSession(callSid, session);
}

export async function deleteSession(callSid: string): Promise<void> {
  const key = `${SESSION_PREFIX}${callSid}`;
  await client.del(key);
  logger.debug('Session deleted', { callSid });
}

export async function getActiveSessions(): Promise<string[]> {
  const keys = await client.keys(`${SESSION_PREFIX}*`);
  return keys.map(key => key.replace(SESSION_PREFIX, ''));
}

export async function refreshSessionTTL(callSid: string): Promise<void> {
  const key = `${SESSION_PREFIX}${callSid}`;
  await client.expire(key, SESSION_TTL);
}

// Connection management (not needed for REST API, but kept for compatibility)
export async function connect(): Promise<void> {
  logger.info('Redis: Connected (Upstash REST)');
}

export async function disconnect(): Promise<void> {
  logger.info('Redis: Disconnected');
}

export default {
  client,
  setSession,
  getSession,
  updateSession,
  updateSessionState,
  updateCollectedData,
  addMessage,
  deleteSession,
  getActiveSessions,
  refreshSessionTTL,
  connect,
  disconnect,
};