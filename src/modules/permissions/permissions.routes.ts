import { Router, Response, NextFunction } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { sendSuccess } from '../../utils/apiResponse';
import { prisma } from '../../config/database';
import { AuthRequest } from '../../types/express';

const router = Router();

router.use(authenticateToken);

router.get('/', requirePermission('permissions.read'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const permissions = await prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { action: 'asc' }] });

    // Group by module
    const grouped = permissions.reduce<Record<string, typeof permissions>>((acc, perm) => {
      if (!acc[perm.module]) acc[perm.module] = [];
      acc[perm.module].push(perm);
      return acc;
    }, {});

    sendSuccess(res, { permissions, grouped });
  } catch (err) {
    next(err);
  }
});

export default router;
