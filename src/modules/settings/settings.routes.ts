import { Router, Request, Response } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { prisma } from '../../config/database';
import { sendSuccess, sendError } from '../../utils/apiResponse';

const router = Router();

// GET /settings - list all non-internal settings
router.get('/', authenticateToken, requirePermission('settings.read'), async (req: Request, res: Response) => {
  try {
    const settings = await prisma.setting.findMany({ orderBy: [{ category: 'asc' }, { key: 'asc' }] });
    sendSuccess(res, { settings }, 'Settings retrieved');
  } catch (err) {
    sendError(res, 'Failed to retrieve settings', 500);
  }
});

// PATCH /settings/:key - update a single setting value
router.patch('/:key', authenticateToken, requirePermission('settings.update'), async (req: Request, res: Response) => {
  const { key } = req.params;
  const { value } = req.body;
  if (value === undefined) { sendError(res, 'value is required', 400); return; }
  try {
    const setting = await prisma.setting.update({ where: { key }, data: { value: String(value) } });
    sendSuccess(res, { setting }, 'Setting updated');
  } catch {
    sendError(res, 'Setting not found', 404);
  }
});

export default router;
