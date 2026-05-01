import { Queue } from 'bullmq';
import { getRedisClient, isRedisConnected } from './redis';
import { logger } from '../utils/logger';

export const QUEUE_NAMES = {
  EMAIL_NOTIFICATIONS: 'email-notifications',
  SMS_NOTIFICATIONS: 'sms-notifications',
  COMMUNICATIONS: 'communications',
  LOG_UPLOADS: 'log-uploads',
  RENEWAL_REMINDERS: 'renewal-reminders',
  PAYMENT_REMINDERS: 'payment-reminders',
  CLEANUP_JOBS: 'cleanup-jobs',
} as const;

const queues: Map<string, Queue> = new Map();

function createQueue(name: string): Queue | null {
  const redis = getRedisClient();
  if (!redis || !isRedisConnected()) {
    logger.warn(`Queue "${name}" not created – Redis unavailable`);
    return null;
  }

  const queue = new Queue(name, {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  });

  queue.on('error', (err) => {
    logger.error(`Queue "${name}" error`, { error: err.message });
  });

  return queue;
}

export function initQueues(): void {
  if (!isRedisConnected()) {
    logger.warn('Queues not initialized – Redis unavailable. Background jobs will be skipped.');
    return;
  }

  for (const name of Object.values(QUEUE_NAMES)) {
    const q = createQueue(name);
    if (q) {
      queues.set(name, q);
      logger.info(`Queue initialized: ${name}`);
    }
  }
}

export function getQueue(name: string): Queue | null {
  return queues.get(name) ?? null;
}

export async function addJob<T>(
  queueName: string,
  jobName: string,
  data: T,
  opts?: object,
): Promise<boolean> {
  const queue = getQueue(queueName);
  if (!queue) {
    logger.warn(`Skipping job "${jobName}" on queue "${queueName}" – queue unavailable`);
    return false;
  }
  try {
    await queue.add(jobName, data, opts);
    return true;
  } catch (err) {
    logger.error(`Failed to add job "${jobName}" to queue "${queueName}"`, { error: err });
    return false;
  }
}
