import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { createDatabase } from './index.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run migrations.');
}

const { client, db } = createDatabase(databaseUrl);

try {
  await migrate(db, {
    migrationsFolder: new URL('../migrations', import.meta.url).pathname,
  });
} finally {
  await client.end();
}
