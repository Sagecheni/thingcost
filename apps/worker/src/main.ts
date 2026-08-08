import pino from 'pino';

import { loadRuntimeConfig } from '@thingcost/config';
import { createDatabase } from '@thingcost/database';

import { runAssetPurgeCycle } from './asset-purge-worker.js';
import { runReminderCycle } from './reminder-worker.js';
import { runValuationCycle } from './valuation-worker.js';

const config = loadRuntimeConfig();
const logger = pino({
  level: config.LOG_LEVEL,
  redact: [
    'DATABASE_URL',
    'APP_MASTER_KEY',
    'TELEGRAM_BOT_TOKEN',
    'REMINDER_WEBHOOK_SECRET',
    'TAVILY_API_KEY',
    'AI_API_KEY',
  ],
});
const database = createDatabase(config.DATABASE_URL);
let cycleRunning = false;
let stopping = false;

async function cycle(): Promise<void> {
  if (cycleRunning || stopping) return;
  cycleRunning = true;
  try {
    const reminderStats = await runReminderCycle(database.db, config);
    if (
      reminderStats.expandedOccurrences > 0 ||
      reminderStats.queuedDeliveries > 0 ||
      reminderStats.sentDeliveries > 0 ||
      reminderStats.failedDeliveries > 0
    ) {
      logger.info(reminderStats, 'Reminder cycle completed');
    }

    const purgeStats = await runAssetPurgeCycle(database.db, config);
    if (purgeStats.dueAssets > 0) {
      logger.info(purgeStats, 'Asset purge cycle completed');
    }

    const valuationStats = await runValuationCycle(database.db, config);
    if (
      valuationStats.dueSchedules > 0 ||
      valuationStats.completedReports > 0 ||
      valuationStats.failedRuns > 0 ||
      valuationStats.skippedBudget > 0
    ) {
      logger.info(valuationStats, 'Valuation cycle completed');
    }
  } catch (error) {
    logger.error({ err: error }, 'Worker cycle failed');
  } finally {
    cycleRunning = false;
  }
}

logger.info(
  { pollIntervalMs: config.REMINDER_POLL_INTERVAL_MS },
  'Chronicle worker started',
);
void cycle();
const poll = setInterval(() => void cycle(), config.REMINDER_POLL_INTERVAL_MS);

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (stopping) return;
  stopping = true;
  clearInterval(poll);
  while (cycleRunning) await new Promise((resolve) => setTimeout(resolve, 50));
  await database.client.end({ timeout: 5 });
  logger.info({ signal }, 'Chronicle worker stopped');
  process.exitCode = 0;
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
