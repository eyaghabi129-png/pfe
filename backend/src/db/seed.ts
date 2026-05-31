import bcrypt from 'bcryptjs';
import { getDb, initDb } from './client.js';

async function seed() {
  await initDb();
  const db = getDb();

  const passwordHash = await bcrypt.hash('password123', 10);

  await db.query(
    `insert into users (email, password_hash, full_name, role)
     values ($1,$2,$3,$4)
     on conflict (email) do nothing`,
    ['admin@tt.local', passwordHash, 'Admin', 'admin'],
  );

  await db.query(
    `insert into users (email, password_hash, full_name, role)
     values ($1,$2,$3,$4)
     on conflict (email) do nothing`,
    ['manager@tt.local', passwordHash, 'Manager', 'manager'],
  );

  await db.query(
    `insert into users (email, password_hash, full_name, role)
     values ($1,$2,$3,$4)
     on conflict (email) do nothing`,
    ['user@tt.local', passwordHash, 'User', 'user'],
  );

  const cats = ['Finance', 'Ressources Humaines', 'Support Client'];
  for (const name of cats) {
    await db.query(`insert into document_categories (name) values ($1) on conflict (name) do nothing`, [name]);
  }

  await db.end();
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
