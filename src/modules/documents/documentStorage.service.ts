import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { uploadToS3 } from '../../config/s3';

const DEFAULT_MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
]);

export interface StoredDocumentFile {
  fileName: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  fileUrl: string;
  storageKey: string;
  checksum: string;
}

function safeSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'file';
}

export function validateUploadFile(file: Express.Multer.File, maxSize = DEFAULT_MAX_FILE_SIZE): void {
  if (!file) throw new Error('No file uploaded');
  if (file.size > maxSize) {
    throw new Error(`File exceeds maximum size of ${Math.round(maxSize / 1024 / 1024)}MB`);
  }
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw new Error(`Unsupported file type: ${file.mimetype}`);
  }
}

export async function storeUploadedDocument(file: Express.Multer.File, sourceModule = 'general'): Promise<StoredDocumentFile> {
  validateUploadFile(file);

  const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const ext = path.extname(file.originalname) || '';
  const base = safeSegment(path.basename(file.originalname, ext));
  const fileName = `${base}-${Date.now()}-${crypto.randomUUID()}${ext.toLowerCase()}`;
  const storageKey = `documents/${safeSegment(sourceModule)}/${new Date().getFullYear()}/${fileName}`;

  const cloudUrl = await uploadToS3(storageKey, file.buffer, file.mimetype, {
    checksum,
    originalName: file.originalname,
  });

  let fileUrl = cloudUrl;
  if (!fileUrl) {
    const root = path.resolve(process.cwd(), 'storage');
    const absolutePath = path.join(root, storageKey);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, file.buffer);
    fileUrl = absolutePath;
  }

  return {
    fileName,
    originalFileName: file.originalname,
    mimeType: file.mimetype,
    fileSize: file.size,
    fileUrl,
    storageKey,
    checksum,
  };
}
