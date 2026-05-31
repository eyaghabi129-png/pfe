import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | undefined;

export function getDb(): pg.Pool {
  if (!pool) throw new Error('DB not initialized');
  return pool;
}

export async function initDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  pool = new Pool({ connectionString: databaseUrl });
  await pool.query('select 1 as ok');
}
