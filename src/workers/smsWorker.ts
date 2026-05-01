import { Worker, Job } from 'bullmq';
import { getRedisClient } from '../config/redis';
import { QUEUE_NAMES } from '../config/queues';
import { sendSms, SmsOptions } from '../services/smsService';
import { logger } from '../utils/logger';

export function startSmsWorker(): Worker | null {
  const redis = getRedisClient();
  if (!redis) {
    logger.warn('SMS worker not started - Redis unavailable');
    return null;
  }

  const worker = new Worker(
    QUEUE_NAMES.SMS_NOTIFICATIONS,
    async (job: Job) => {
      const result = await sendSms(job.data as SmsOptions);
      if (!result.success) throw new Error(result.error ?? 'SMS delivery failed');
    },
    { connection: redis, concurrency: 5 },
  );

  worker.on('failed', (job, err) => logger.error('SMS job failed', { jobId: job?.id, error: err.message }));
  logger.info('SMS worker started');
  return worker;
}
