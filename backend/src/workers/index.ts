import { createEngagementWorker, createScheduledWorker } from '../services/queue.service';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { connectRedis, disconnectRedis } from '../config/redis';
import { logger } from '../utils/logger';

async function startWorkers() {
  try {
    logger.info('Starting workers...');

    await connectDatabase();
    await connectRedis();

    const engagementWorker = createEngagementWorker();
    const scheduledWorker = createScheduledWorker();

    logger.info('Workers started successfully');
    logger.info(`Engagement worker concurrency: ${engagementWorker.opts.concurrency}`);

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down workers...');
      await engagementWorker.close();
      await scheduledWorker.close();
      await disconnectDatabase();
      await disconnectRedis();
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    logger.error('Failed to start workers', { error });
    process.exit(1);
  }
}

startWorkers();
