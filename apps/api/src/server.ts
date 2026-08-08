import { loadRuntimeConfig } from '@thingcost/config';
import { createDatabase } from '@thingcost/database';

import { buildApp } from './app.js';

const config = loadRuntimeConfig();
const database = createDatabase(config.DATABASE_URL);
const app = await buildApp(config, { db: database.db });

app.addHook('onClose', async () => {
  await database.client.end();
});

const shutdown = async (signal: NodeJS.Signals) => {
  app.log.info({ signal }, 'Stopping Chronicle API');
  await app.close();
  process.exitCode = 0;
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.fatal(error, 'Unable to start Chronicle API');
  process.exitCode = 1;
}
