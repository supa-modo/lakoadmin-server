import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';
import { fileLogger } from '../services/fileLogger';
import { sendError } from '../utils/apiResponse';
import { env } from '../config/env';

export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, `Route not found: ${req.method} ${req.path}`, 404);
}

export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const requestId = req.headers['x-request-id'] as string;

  // Zod validation errors
  if (err instanceof ZodError) {
    const messages = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    sendError(res, messages, 422, 'VALIDATION_ERROR');
    return;
  }

  // Prisma errors
  if ((err as any).code === 'P2002') {
    const field = (err as any).meta?.target?.[0] ?? 'field';
    sendError(res, `A record with this ${field} already exists`, 409, 'DUPLICATE_ENTRY');
    return;
  }

  if ((err as any).code === 'P2025') {
    sendError(res, 'Record not found', 404, 'NOT_FOUND');
    return;
  }

  // Generic server error
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    requestId,
    path: req.path,
    method: req.method,
  });

  fileLogger.error('error', err.message, {
    stack: err.stack,
    requestId,
    path: req.path,
    method: req.method,
  });

  const message = env.isDev ? err.message : 'Internal server error';
  const error = env.isDev ? err.stack : undefined;

  sendError(res, message, 500, error);
}
