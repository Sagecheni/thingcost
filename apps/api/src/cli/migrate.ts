import { resolve } from 'node:path';

import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { loadRuntimeConfig } from '@thingcost/config';
import { createDatabase } from '@thingcost/database';

const config = loadRuntimeConfig();
const { client, db } = createDatabase(config.DATABASE_URL);
const migrationsFolder = resolve(
  process.env.MIGRATIONS_DIR ?? 'packages/database/migrations',
);

try {
  await migrate(db, { migrationsFolder });
  process.stdout.write(`Database migrations applied from ${migrationsFolder}.\n`);
} finally {
  await client.end();
}
