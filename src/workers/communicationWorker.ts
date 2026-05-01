import { Worker, Job } from 'bullmq';
import { getRedisClient } from '../config/redis';
import { QUEUE_NAMES } from '../config/queues';
import { deliverMessage } from '../modules/communications/delivery.service';
import { logger } from '../utils/logger';

export function startCommunicationWorker(): Worker | null {
  const redis = getRedisClient();
  if (!redis) {
    logger.warn('Communication worker not started - Redis unavailable');
    return null;
  }

  const worker = new Worker(
    QUEUE_NAMES.COMMUNICATIONS,
    async (job: Job) => {
      const { messageLogId } = job.data as { messageLogId: string };
      await deliverMessage(messageLogId);
    },
    { connection: redis, concurrency: 5 },
  );

  worker.on('completed', (job) => logger.info('Communication job completed', { jobId: job.id }));
  worker.on('failed', (job, err) => logger.error('Communication job failed', { jobId: job?.id, error: err.message }));
  logger.info('Communication worker started');
  return worker;
}
