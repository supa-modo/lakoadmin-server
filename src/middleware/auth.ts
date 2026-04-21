import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { verifyAccessToken } from '../utils/jwt';
import { sendError } from '../utils/apiResponse';
import { AuthRequest } from '../types/express';
import { cache } from '../config/redis';
import { logger } from '../utils/logger';

const PERMISSION_CACHE_TTL = 300; // 5 minutes

export async function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    sendError(res, 'No token provided', 401);
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyAccessToken(token);

    // Try to get permissions from cache
    const cacheKey = `user:perms:${payload.userId}`;
    const cached = await cache.get(cacheKey);

    if (cached) {
      const { user } = JSON.parse(cached);
      req.user = user;
      next();
      return;
    }

    // Load from DB
    const user = await prisma.user.findUnique({
      where: { id: payload.userId, deletedAt: null },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    if (!user || !user.isActive) {
      sendError(res, 'Account not found or inactive', 401);
      return;
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      sendError(res, `Account temporarily locked. Try again in ${minutesLeft} minutes.`, 403);
      return;
    }

    const roles = user.roles.map((ur) => ur.role.name);
    const permissions = [
      ...new Set(
        user.roles.flatMap((ur) =>
          ur.role.permissions.map((rp) => rp.permission.name),
        ),
      ),
    ];

    const authUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles,
      permissions,
    };

    req.user = authUser;

    // Cache for next requests
    await cache.setex(cacheKey, PERMISSION_CACHE_TTL, JSON.stringify({ user: authUser }));

    next();
  } catch (err) {
    logger.debug('Token verification failed', { error: (err as Error).message });
    sendError(res, 'Invalid or expired token', 401);
  }
}

export function invalidateUserCache(userId: string): Promise<void> {
  return cache.del(`user:perms:${userId}`);
}
