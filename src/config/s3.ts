import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { env } from './env';
import { logger } from '../utils/logger';

let s3Client: S3Client | null = null;
let isS3Available = false;

export function initS3(): void {
  if (!env.SPACES_KEY || !env.SPACES_SECRET) {
    logger.warn('S3/Spaces credentials not set – file uploads to cloud disabled');
    return;
  }

  s3Client = new S3Client({
    endpoint: env.SPACES_ENDPOINT,
    region: env.SPACES_REGION,
    credentials: {
      accessKeyId: env.SPACES_KEY,
      secretAccessKey: env.SPACES_SECRET,
    },
    forcePathStyle: false,
  });

  isS3Available = true;
  logger.info('S3/Spaces client initialized', { endpoint: env.SPACES_ENDPOINT, bucket: env.SPACES_BUCKET });
}

export function getS3Client(): S3Client | null {
  return s3Client;
}

export function isS3Connected(): boolean {
  return isS3Available;
}

export async function uploadToS3(
  key: string,
  body: Buffer,
  contentType: string,
  metadata?: Record<string, string>,
): Promise<string | null> {
  if (!s3Client || !isS3Available) {
    logger.warn('S3 upload skipped – not configured', { key });
    return null;
  }

  try {
    const command = new PutObjectCommand({
      Bucket: env.SPACES_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata,
      ACL: 'private',
    });

    await s3Client.send(command);
    const url = `${env.SPACES_ENDPOINT}/${env.SPACES_BUCKET}/${key}`;
    logger.info('File uploaded to S3', { key, url });
    return url;
  } catch (error) {
    logger.error('S3 upload failed', { key, error: (error as Error).message });
    return null;
  }
}

export async function getFromS3(key: string): Promise<Buffer | null> {
  if (!s3Client || !isS3Available) return null;

  try {
    const command = new GetObjectCommand({
      Bucket: env.SPACES_BUCKET,
      Key: key,
    });

    const response = await s3Client.send(command);
    if (!response.Body) return null;

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (error) {
    logger.error('S3 download failed', { key, error: (error as Error).message });
    return null;
  }
}
