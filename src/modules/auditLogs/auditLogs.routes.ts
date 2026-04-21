import { Router, Response, NextFunction } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { prisma } from '../../config/database';
import { sendPaginated, buildPaginationMeta } from '../../utils/apiResponse';
import { getPaginationParams } from '../../utils/pagination';
import { AuthRequest } from '../../types/express';

const router = Router();

router.use(authenticateToken);

router.get('/', requirePermission('audit.read'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { page, limit, skip } = getPaginationParams(req);
    const { userId, entity, action, from, to } = req.query as Record<string, string>;

    const where: Record<string, unknown> = {};

    if (userId) where.userId = userId;
    if (entity) where.entity = { contains: entity, mode: 'insensitive' };
    if (action) where.action = { contains: action, mode: 'insensitive' };

    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as any).gte = new Date(from);
      if (to) (where.createdAt as any).lte = new Date(to);
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: where as any,
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where: where as any }),
    ]);

    sendPaginated(res, logs, buildPaginationMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
});

export default router;
