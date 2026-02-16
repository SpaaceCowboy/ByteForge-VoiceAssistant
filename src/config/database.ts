import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg'
import logger from '../utils/logger'                                                                                    

//connection pool

const getPoolConfig = () => {
    if (process.env.DATABASE_URL) {
        return {
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production'
            ? { rejectUnauthorized: false}
            : false,
        };
    }

    return {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'voice_assistant',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl: process.env.NODE_ENV === 'production'
         ? { rejectUnathorized: false}
         : false,
    };
};

const pool = new Pool({
    ...getPoolConfig(),
    max: 20, // maximum connection poll
    idleTimeoutMillis: 3000, //close afk connection after 30s
    connectionTimeoutMillis: 2000, // fail fast if cant connect
});

//log poll event 

pool.on('connect', () => {
    logger.error('Database pool: bew client connected',)
});

pool.on('error', (err: Error) => {
    logger.error('Database pool error')
})


//query helper

export async function query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
): Promise<QueryResult<T>> {
    const start = Date.now();

    try {
        const result = await pool.query<T>(text, params);
        const duration = Date.now() - start;

        if (duration > 100) { //high ping1
            logger.warn('Slow query detected', {
                query: text.substring(0, 100),
                duration: `${duration}ms`,
                rows: result.rowCount,
            });
        }

        return result;
    } catch (error) {
        logger.error('Database query error', {
            query: text.substring(0, 100),
            error: error instanceof Error ? error.message: 'unknown error',
        });
        throw error
    }
}

export async function getClient(): Promise<PoolClient> {
    return pool.connect();
}

export async function transaction<T>(
    callback: (client: PoolClient) => Promise<T>
): Promise<T> {
    const client = await pool.connect();

    try {
        await client.query('Begine');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
      client.release()
    }
}


// test database connection

export async function testConnection(): Promise<boolean> {
    try {
      const result = await pool.query('SELECT NOW()');
      logger.info('Database connected', { 
        timestamp: result.rows[0].now 
      });
      return true;
    } catch (error) {
      logger.error('Database connection failed', error);
      return false;
    }
  }

  export async function closePool(): Promise<void> {
    await pool.end();
    logger.info('Database pool closed');
  }

// close all pool connection


export default {
    query,
    getClient,
    transaction,
    testConnection,
    closePool,
    pool, // Export pool for advanced use cases
  };