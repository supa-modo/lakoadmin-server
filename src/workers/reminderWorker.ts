import { Worker, Job } from 'bullmq';
import { getRedisClient } from '../config/redis';
import { QUEUE_NAMES } from '../config/queues';
import { logger } from '../utils/logger';
import { createNotification } from '../modules/communications/notifications.service';

export function startReminderWorker(): Worker | null {
  const redis = getRedisClient();
  if (!redis) {
    logger.warn('Reminder worker not started - Redis unavailable');
    return null;
  }

  const worker = new Worker(
    QUEUE_NAMES.RENEWAL_REMINDERS,
    async (job: Job) => {
      const data = job.data as { userId?: string; title?: string; message?: string; relatedEntityType?: string; relatedEntityId?: string };
      if (!data.userId) return;
      await createNotification({
        userId: data.userId,
        title: data.title ?? 'Reminder',
        message: data.message ?? 'You have a pending reminder.',
        type: 'REMINDER',
        relatedEntityType: data.relatedEntityType,
        relatedEntityId: data.relatedEntityId,
      });
    },
    { connection: redis, concurrency: 3 },
  );

  worker.on('failed', (job, err) => logger.error('Reminder job failed', { jobId: job?.id, error: err.message }));
  logger.info('Reminder worker started');
  return worker;
}
