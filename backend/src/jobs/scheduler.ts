import cron from 'node-cron';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { connectRedis, disconnectRedis } from '../config/redis';
import { webhookService } from '../services/webhook.service';
import { sessionService } from '../services/session.service';
import { credentialRefreshService } from '../services/credential-refresh.service';
import { retentionService } from '../services/retention.service';
import { logger } from '../utils/logger';

/**
 * Maintenance scheduler.
 *
 * Separate from the BullMQ workers on purpose: those consume queues driven by
 * user activity, while these are periodic housekeeping sweeps that must run
 * exactly once per interval per deployment. Run a single instance.
 *
 * Started with `npm run cron`.
 */

/** Guards against a slow sweep overlapping its own next tick. */
const running = new Set<string>();

async function runTask(name: string, task: () => Promise<void>): Promise<void> {
  if (running.has(name)) {
    logger.warn(`Skipping ${name}: previous run still in progress`);
    return;
  }

  running.add(name);
  const startedAt = Date.now();

  try {
    await task();
    logger.debug(`Task ${name} finished`, { durationMs: Date.now() - startedAt });
  } catch (error) {
    logger.error(`Task ${name} failed`, { error });
  } finally {
    running.delete(name);
  }
}

function scheduleTasks(): cron.ScheduledTask[] {
  return [
    // Webhook retries — the backoff floor is 15s, so a minute-granularity sweep
    // is the right resolution.
    cron.schedule('* * * * *', () =>
      runTask('webhook-retries', async () => {
        await webhookService.processDueRetries(200);
      })
    ),

    // Expired and long-revoked sessions.
    cron.schedule('0 * * * *', () =>
      runTask('session-cleanup', async () => {
        const removed = await sessionService.cleanExpiredSessions();
        if (removed > 0) logger.info('Cleaned up sessions', { removed });
      })
    ),

    // Credentials nearing expiry that declare a refresh strategy.
    cron.schedule('*/15 * * * *', () =>
      runTask('credential-refresh', async () => {
        const { refreshed, failed } = await credentialRefreshService.refreshExpiringCredentials();
        if (refreshed > 0 || failed > 0) {
          logger.info('Credential refresh sweep', { refreshed, failed });
        }
      })
    ),

    // Data retention sweeps (old runs and logs).
    cron.schedule('30 3 * * *', () =>
      runTask('retention', async () => {
        const removed = await retentionService.cleanup();
        logger.info('Retention sweep complete', removed);
      })
    ),
  ];
}

async function start() {
  try {
    await connectDatabase();
    await connectRedis();

    const tasks = scheduleTasks();
    logger.info(`Scheduler started with ${tasks.length} tasks`);

    const shutdown = async () => {
      logger.info('Shutting down scheduler...');
      for (const task of tasks) task.stop();
      await disconnectDatabase();
      await disconnectRedis();
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    logger.error('Failed to start scheduler', { error });
    process.exit(1);
  }
}

start();
