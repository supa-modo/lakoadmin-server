import { Worker, Job } from 'bullmq';
import { getRedisClient } from '../config/redis';
import { uploadYesterdayLogs } from '../services/logUploadService';
import { logger } from '../utils/logger';
import { QUEUE_NAMES } from '../config/queues';
import { addJob } from '../config/queues';

export function startLogUploadWorker(): Worker | null {
  const redis = getRedisClient();
  if (!redis) {
    logger.warn('Log upload worker not started – Redis unavailable');
    return null;
  }

  const worker = new Worker(
    QUEUE_NAMES.LOG_UPLOADS,
    async (job: Job) => {
      logger.info('Processing log upload job', { jobId: job.id });
      await uploadYesterdayLogs();
    },
    { connection: redis, concurrency: 1 },
  );

  worker.on('completed', (job) => logger.info('Log upload job completed', { jobId: job.id }));
  worker.on('failed', (job, err) => logger.error('Log upload job failed', { jobId: job?.id, error: err.message }));

  logger.info('Log upload worker started');
  return worker;
}

/**
 * Schedule the daily log upload at 1:00 AM EAT (UTC+3 = 22:00 UTC previous day)
 */
export async function scheduleDailyLogUpload(): Promise<void> {
  await addJob(
    QUEUE_NAMES.LOG_UPLOADS,
    'daily-log-upload',
    {},
    {
      repeat: { pattern: '0 22 * * *' }, // 1 AM EAT = 22:00 UTC
      removeOnComplete: { count: 7 },
      removeOnFail: { count: 7 },
    },
  );
  logger.info('Daily log upload scheduled (1 AM EAT)');
}
