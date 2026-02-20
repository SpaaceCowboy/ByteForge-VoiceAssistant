import {createClient, RedisClientType } from 'redis'
import logger from '../utils/logger'
import type { Session, Message, SessionState, CollectedData } from '../../types/index'

//redis client

const client: RedisClientType = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
        reconnectStrategy: (retries: number): number | Error => {
            if (retries > 10) {
                logger.error('Redis: Max reconnection attempts reached');
                return new Error('Max reconnection attempts reached ')
            }

            const delay = Math.min(retries *100, 3000);
            logger.warn (`Redis: Reconnecting in ${delay}ms (attempt ${retries + 1})`)
            return delay;
        } 
    }
})

//event handler 
client.on('connect', () => {
    logger.info('Redis: Connected');
});

client.on('error', (err: Error) => {
    logger.error('Redis error', err)
});

client.on ('reconnecting', () => {
    logger.warn('Redis: Reconnecting...');
})

// session constants

const SESSION_PREFIX = 'session:';
const SESSION_TTL = 3600; // 1 hour 

// session functions
// create or update a session

export async function setSession(callSid: string, session: Session): Promise<void> {
    const key =  `${SESSION_PREFIX}${callSid}`;
    await client.setEx(key, SESSION_TTL, JSON.stringify(session));
    logger.debug('Session saved', { callSid })
}

//get session by call SID

export async function getSession(callSid: string): Promise<Session | null> {
    const key = `${SESSION_PREFIX}${callSid}`;
    const data = await client.get(key);

    if (!data) {
        return null;
    }

    try {
        return JSON.parse(data) as Session;
    } catch (error) {
        logger.error('Failed to parse session', { callSid, error})
        return null
    }
}

// update diffrent session fields 
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

  // update session state

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

  // update collected
  
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

  //add a message to the conversation history

  export async function addMessage(callSid: string, message: Message): Promise<void> {
    const session = await getSession(callSid);

    if (!session) {
        logger.warn('Cannot add message to non-existent session', { callSid });
        return;
    }

    session.messageHistory.push(message);
    await setSession(callSid, session);
  }

  // delet a session
  export async function deleteSession(callSid: string): Promise<void> {
    const key = `${SESSION_PREFIX}${callSid}`;
    await client.del(key);
    logger.debug('Session deleted', {callSid})
  }

  // get all active session keys

  export async function getActiveSessions(): Promise<string[]> {
    const keys = await client.keys(`${SESSION_PREFIX}*`);
    return keys.map(key => key.replace(SESSION_PREFIX, ''));
  }


// refresh session TTL 

export async function refreshSessionTTL(callSid: string): Promise<void> {
    const key = `${SESSION_PREFIX}${callSid}`;
    await client.expire(key, SESSION_TTL)
}

// connection management

// connect to redis
export async function connect(): Promise<void> {
    if (!client.isOpen) {
        await client.connect()
    }
}

// disconnect from redis

export async function disconnect(): Promise<void> {
    if (client.isOpen) {
        await client.quit();
        logger.info('Redis: Disconnected')
    }
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