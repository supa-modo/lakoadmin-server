import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { promisify } from 'util';
import { uploadToS3, isS3Connected } from '../config/s3';
import { logger } from '../utils/logger';
import { fileLogger } from './fileLogger';

const gzip = promisify(zlib.gzip);

function getLogFilePath(date: Date): string {
  const dateStr = date.toISOString().slice(0, 10);
  return path.resolve(process.cwd(), 'logs', `logs-${dateStr}.json`);
}

function getS3Key(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dateStr = date.toISOString().slice(0, 10);
  return `logs/system-logs/${year}/${month}/logs-${dateStr}.json.gz`;
}

export async function uploadYesterdayLogs(): Promise<void> {
  if (!isS3Connected()) {
    logger.info('Log upload skipped – S3 not configured');
    return;
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const filePath = getLogFilePath(yesterday);

  if (!fs.existsSync(filePath)) {
    logger.info('No log file for yesterday to upload', { filePath });
    return;
  }

  try {
    const content = fs.readFileSync(filePath);
    const compressed = await gzip(content);
    const s3Key = getS3Key(yesterday);

    const url = await uploadToS3(s3Key, compressed, 'application/gzip', {
      'original-file': path.basename(filePath),
      'upload-date': new Date().toISOString(),
    });

    if (url) {
      logger.info('Log file uploaded to S3', { s3Key, url });
      fileLogger.info('system', 'Daily log file uploaded to S3', { s3Key, url });

      // Delete local file after successful upload
      fs.unlinkSync(filePath);
      logger.info('Local log file deleted after upload', { filePath });
    }
  } catch (err) {
    logger.error('Log upload failed', { error: (err as Error).message, filePath });
    fileLogger.error('system', 'Log upload failed', { error: (err as Error).message });
  }
}
