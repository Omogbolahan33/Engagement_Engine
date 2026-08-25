import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../config/redis';
import { config } from '../config';
import { executorService } from './executor.service';
import { rateLimitService } from './rate-limit.service';
import { webhookService } from './webhook.service';
import { realtimeService } from './realtime.service';
import { prisma } from '../config/database';
import { createContextLogger } from '../utils/logger';

const log = createContextLogger('queue');

// Engagement execution queue
export const engagementQueue = new Queue('engagement-execution', {
  connection: redis,
  defaultJobOptions: {
    attempts: config.worker.maxRetries,
    backoff: {
      type: 'exponential',
      delay: config.worker.retryDelayMs,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

// Scheduled engagement queue
export const scheduledQueue = new Queue('engagement-scheduled', {
  connection: redis,
});

/**
 * Add an engagement to the execution queue
 */
export async function enqueueEngagement(
  engagementId: string,
  options?: {
    priority?: number;
    delay?: number;
    credentialId?: string;
  }
): Promise<Job> {
  const engagement = await prisma.engagement.findUnique({
    where: { id: engagementId },
    include: { site: true },
  });

  if (!engagement) {
    throw new Error(`Engagement ${engagementId} not found`);
  }

  // Deduplication: check if this engagement already has a pending/active job
  const dedupeKey = `job:dedupe:${engagementId}`;
  const existingJobId = await redis.get(dedupeKey);
  if (existingJobId) {
    const existingJob = await engagementQueue.getJob(existingJobId);
    if (existingJob && ['waiting', 'delayed', 'active'].includes(await existingJob.getState())) {
      log.info('Engagement already queued, skipping', { engagementId, existingJobId });
      return existingJob;
    }
  }

  const jobId = `engagement:${engagementId}:${Date.now()}`;

  const job = await engagementQueue.add(
    'execute',
    {
      engagementId: engagement.id,
      siteId: engagement.siteId,
      credentialId: options?.credentialId,
      engagementType: engagement.engagementType,
      targetConfig: engagement.targetConfig,
      config: engagement.config,
    },
    {
      priority: options?.priority || engagement.priority,
      delay: options?.delay,
      jobId,
    }
  );

  // Store deduplication key (5 min TTL)
  await redis.setex(dedupeKey, 300, jobId);

  // Update status to QUEUED
  await prisma.engagement.update({
    where: { id: engagementId },
    data: { status: 'ACTIVE' },
  });

  log.info('Engagement queued', { engagementId, jobId: job.id });
  return job;
}

/**
 * Schedule recurring engagement execution
 */
export async function scheduleEngagement(
  engagementId: string,
  cronExpression: string
): Promise<void> {
  const engagement = await prisma.engagement.findUnique({
    where: { id: engagementId },
  });

  if (!engagement) {
    throw new Error(`Engagement ${engagementId} not found`);
  }

  await scheduledQueue.add(
    'schedule',
    { engagementId },
    {
      repeat: { pattern: cronExpression },
      jobId: `schedule:${engagementId}`,
    }
  );

  await prisma.engagement.update({
    where: { id: engagementId },
    data: {
      status: 'SCHEDULED',
      schedule: { ...engagement.schedule as object, cron: cronExpression },
    },
  });

  log.info('Engagement scheduled', { engagementId, cron: cronExpression });
}

/**
 * Create the worker that processes engagement jobs
 */
export function createEngagementWorker(): Worker {
  const worker = new Worker(
    'engagement-execution',
    async (job: Job) => {
      const { engagementId, siteId, credentialId, engagementType, targetConfig, config: engConfig } = job.data;

      log.info('Processing engagement', { engagementId, jobId: job.id });

      // Check if engagement is still active
      const engagement = await prisma.engagement.findUnique({
        where: { id: engagementId },
      });

      if (!engagement || engagement.status === 'PAUSED' || engagement.status === 'COMPLETED') {
        log.info('Skipping inactive engagement', { engagementId, status: engagement?.status });
        return { skipped: true, reason: 'Engagement not active' };
      }

      // Check expiry
      if (engagement.expiresAt && engagement.expiresAt < new Date()) {
        await prisma.engagement.update({
          where: { id: engagementId },
          data: { status: 'EXPIRED' },
        });
        log.info('Engagement expired', { engagementId });
        return { skipped: true, reason: 'Engagement expired' };
      }

      // Check per-engagement rate limits before executing
      const rateLimitCheck = await rateLimitService.checkEngagementLimit(engagementId);
      if (!rateLimitCheck.allowed) {
        log.info('Engagement rate limited, requeuing', {
          engagementId,
          reason: rateLimitCheck.reason,
          retryAfterMs: rateLimitCheck.retryAfterMs,
        });
        // Requeue with delay instead of failing
        await engagementQueue.add('execute', job.data, {
          delay: rateLimitCheck.retryAfterMs || 60000,
          jobId: `engagement:${engagementId}:${Date.now()}`,
        });
        return { skipped: true, reason: rateLimitCheck.reason };
      }

      // Add jitter delay to appear human
      const jitterMs = rateLimitService.calculateJitter(
        ((engagement.frequency as any)?.jitterMs) || 5000
      );
      if (jitterMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, jitterMs));
      }

      // Execute the engagement
      const result = await executorService.execute({
        engagementId,
        siteId,
        credentialId,
        engagementType,
        targetConfig,
        config: engConfig,
      });

      // Record execution in rate limit windows
      await rateLimitService.recordExecution(engagementId);

      // Handle rate limiting from target platform
      if (result.statusCode === 429) {
        log.warn('Rate limited by target platform', { engagementId });
        throw new Error('Rate limited by target platform');
      }

      // Organization that owns this run — needed by both webhook branches below
      const organizationId = (
        await prisma.site.findUnique({
          where: { id: siteId },
          select: { organizationId: true },
        })
      )?.organizationId;

      // Handle auth expiry
      if (result.statusCode === 401 || result.statusCode === 403) {
        log.warn('Authentication failed', { engagementId, statusCode: result.statusCode });
        await prisma.engagement.update({
          where: { id: engagementId },
          data: { status: 'FAILED' },
        });
        await prisma.engagementLog.create({
          data: {
            engagementId,
            level: 'ERROR',
            message: `Authentication failed (${result.statusCode}). Please refresh credentials.`,
            data: { statusCode: result.statusCode },
          },
        });

        // Fire webhook + push to any connected dashboards
        if (organizationId) {
          await webhookService.deliver(organizationId, 'engagement.failed', {
            engagementId,
            error: result.error,
            statusCode: result.statusCode,
          }).catch(() => {});

          await realtimeService.publish(organizationId, 'run.failed', {
            engagementId,
            siteId,
            error: result.error,
            statusCode: result.statusCode,
          });
        }
      }

      // Fire success webhook
      if (result.success) {
        if (organizationId) {
          await webhookService.deliver(organizationId, 'run.completed', {
            engagementId,
            runId: job.id,
            statusCode: result.statusCode,
          }).catch(() => {});

          await realtimeService.publish(organizationId, 'run.completed', {
            engagementId,
            siteId,
            runId: job.id,
            statusCode: result.statusCode,
            responseTime: result.responseTime,
          });
        }
      }

      return result;
    },
    {
      connection: redis,
      concurrency: config.worker.concurrency,
      limiter: {
        max: 100,
        duration: 60000,
      },
    }
  );

  worker.on('completed', (job) => {
    log.info('Job completed', { jobId: job.id, result: job.returnvalue });
  });

  worker.on('failed', (job, error) => {
    log.error('Job failed', { jobId: job?.id, error: error.message });
  });

  worker.on('error', (error) => {
    log.error('Worker error', { error: error.message });
  });

  return worker;
}

/**
 * Create the scheduled engagement worker
 */
export function createScheduledWorker(): Worker {
  const worker = new Worker(
    'engagement-scheduled',
    async (job: Job) => {
      const { engagementId } = job.data;

      log.info('Processing scheduled engagement', { engagementId });

      // Enqueue the actual execution
      await enqueueEngagement(engagementId);
    },
    {
      connection: redis,
      concurrency: 2,
    }
  );

  return worker;
}
