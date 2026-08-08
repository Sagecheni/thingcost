import { eq } from 'drizzle-orm';

import { loadRuntimeConfig } from '@thingcost/config';
import { adminUsers, createDatabase, sessions } from '@thingcost/database';

import { hashPassword } from '../services/session.js';

const newPassword = process.env.CHRONICLE_NEW_PASSWORD;

if (!newPassword || newPassword.length < 12) {
  throw new Error('CHRONICLE_NEW_PASSWORD must contain at least 12 characters.');
}

const config = loadRuntimeConfig();
const { client, db } = createDatabase(config.DATABASE_URL);

try {
  const [admin] = await db.select({ id: adminUsers.id }).from(adminUsers).limit(1);

  if (!admin) {
    throw new Error('Chronicle has not been initialized.');
  }

  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (transaction) => {
    await transaction
      .update(adminUsers)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(adminUsers.id, admin.id));
    await transaction.delete(sessions).where(eq(sessions.adminId, admin.id));
  });

  process.stdout.write('Administrator password reset; existing sessions were revoked.\n');
} finally {
  await client.end();
}
