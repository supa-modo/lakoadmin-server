import { Worker, Job } from 'bullmq';
import { getRedisClient } from '../config/redis';
import { sendEmail, EmailOptions } from '../services/emailService';
import { logger } from '../utils/logger';
import { fileLogger } from '../services/fileLogger';
import { QUEUE_NAMES } from '../config/queues';

export function startEmailWorker(): Worker | null {
  const redis = getRedisClient();
  if (!redis) {
    logger.warn('Email worker not started – Redis unavailable');
    return null;
  }

  const worker = new Worker(
    QUEUE_NAMES.EMAIL_NOTIFICATIONS,
    async (job: Job) => {
      const { to, subject, html, text, from } = job.data as EmailOptions;
      logger.info('Processing email job', { jobId: job.id, to, subject });

      const success = await sendEmail({ to, subject, html, text, from });

      if (!success) {
        throw new Error(`Email delivery failed for job ${job.id}`);
      }

      fileLogger.info('system', 'Email job processed', { jobId: job.id, to, subject });
    },
    {
      connection: redis,
      concurrency: 5,
    },
  );

  worker.on('completed', (job) => {
    logger.info('Email job completed', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('Email job failed', { jobId: job?.id, error: err.message });
  });

  logger.info('Email worker started');
  return worker;
}
