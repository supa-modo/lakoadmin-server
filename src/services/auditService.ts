import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { fileLogger } from './fileLogger';
import { logger } from '../utils/logger';
import { AuthRequest } from '../types/express';

export interface AuditLogOptions {
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

export async function createAuditLog(opts: AuditLogOptions): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: opts.userId ?? null,
        action: opts.action,
        entity: opts.entity,
        entityId: opts.entityId ?? null,
        before: (opts.before ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (opts.after ?? undefined) as Prisma.InputJsonValue | undefined,
        ipAddress: opts.ipAddress ?? null,
        userAgent: opts.userAgent ?? null,
        requestId: opts.requestId ?? null,
        metadata: (opts.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    fileLogger.info('audit', `${opts.action} on ${opts.entity}`, {
      userId: opts.userId,
      entityId: opts.entityId,
      action: opts.action,
      entity: opts.entity,
    });
  } catch (err) {
    logger.error('Failed to create audit log', { error: (err as Error).message, ...opts });
  }
}

export function auditFromRequest(
  req: AuthRequest,
  action: string,
  entity: string,
  entityId?: string,
  before?: Record<string, unknown> | null,
  after?: Record<string, unknown> | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  return createAuditLog({
    userId: req.user?.id,
    action,
    entity,
    entityId,
    before: before ?? null,
    after: after ?? null,
    ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '',
    userAgent: req.headers['user-agent'],
    requestId: req.headers['x-request-id'] as string,
    metadata,
  });
}

// Fire-and-forget version (non-blocking)
export function logAudit(
  req: Request,
  action: string,
  entity: string,
  entityId?: string,
  before?: Record<string, unknown> | null,
  after?: Record<string, unknown> | null,
): void {
  const authReq = req as AuthRequest;
  auditFromRequest(authReq, action, entity, entityId, before, after).catch((err) => {
    logger.error('Background audit log failed', { error: (err as Error).message });
  });
}
