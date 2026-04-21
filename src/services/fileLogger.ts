import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

export type LogCategory = 'api' | 'auth' | 'payment' | 'database' | 'system' | 'audit' | 'error';

export interface FileLogEntry {
  timestamp: string;
  category: LogCategory;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  [key: string]: unknown;
}

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'refreshToken',
  'accessToken',
  'secret',
  'authorization',
  'Authorization',
  'resetPasswordToken',
  'newPassword',
  'currentPassword',
  'confirmPassword',
  'cvv',
  'pin',
]);

function redact(obj: unknown, depth = 0): unknown {
  if (depth > 5 || obj === null || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => redact(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = redact(value, depth + 1);
    }
  }
  return result;
}

function getLogFilePath(): string {
  const logsDir = path.resolve(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(logsDir, `logs-${dateStr}.json`);
}

let writeStream: fs.WriteStream | null = null;
let currentFilePath: string | null = null;

function getStream(): fs.WriteStream {
  const filePath = getLogFilePath();

  // Rotate if date changed
  if (currentFilePath !== filePath) {
    if (writeStream) {
      writeStream.end();
    }
    writeStream = fs.createWriteStream(filePath, { flags: 'a', encoding: 'utf8' });
    currentFilePath = filePath;

    writeStream.on('error', (err) => {
      logger.error('FileLogger write stream error', { error: err.message });
    });
  }

  return writeStream!;
}

export const fileLogger = {
  log(category: LogCategory, level: FileLogEntry['level'], message: string, meta?: Record<string, unknown>): void {
    try {
      const entry: FileLogEntry = {
        timestamp: new Date().toISOString(),
        category,
        level,
        message,
        ...(meta ? (redact(meta) as Record<string, unknown>) : {}),
      };

      const stream = getStream();
      stream.write(JSON.stringify(entry) + '\n');
    } catch (err) {
      logger.error('FileLogger failed to write', { error: (err as Error).message });
    }
  },

  info(category: LogCategory, message: string, meta?: Record<string, unknown>): void {
    this.log(category, 'info', message, meta);
  },

  warn(category: LogCategory, message: string, meta?: Record<string, unknown>): void {
    this.log(category, 'warn', message, meta);
  },

  error(category: LogCategory, message: string, meta?: Record<string, unknown>): void {
    this.log(category, 'error', message, meta);
  },

  debug(category: LogCategory, message: string, meta?: Record<string, unknown>): void {
    this.log(category, 'debug', message, meta);
  },

  getCurrentLogFile(): string {
    return getLogFilePath();
  },

  getLogsDir(): string {
    return path.resolve(process.cwd(), 'logs');
  },

  close(): void {
    if (writeStream) {
      writeStream.end();
      writeStream = null;
      currentFilePath = null;
    }
  },
};
