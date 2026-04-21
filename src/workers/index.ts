import { env } from '../config/env';
import { logger } from '../utils/logger';
import { startEmailWorker } from './emailWorker';
import { startLogUploadWorker, scheduleDailyLogUpload } from './uploadLogs';

const workers: Array<{ close: () => Promise<void> }> = [];

export async function startWorkers(): Promise<void> {
  if (!env.ENABLE_WORKERS) {
    logger.info('Workers disabled (ENABLE_WORKERS=false)');
    return;
  }

  logger.info('Starting background workers...');

  const emailWorker = startEmailWorker();
  if (emailWorker) workers.push(emailWorker);

  const logUploadWorker = startLogUploadWorker();
  if (logUploadWorker) {
    workers.push(logUploadWorker);
    await scheduleDailyLogUpload();
  }

  logger.info(`${workers.length} worker(s) started`);
}

export async function stopWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close()));
  logger.info('All workers stopped');
}
