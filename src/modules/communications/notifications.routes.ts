import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requireAnyPermission } from '../../middleware/rbac';
import { sendSuccess } from '../../utils/apiResponse';
import { AuthRequest } from '../../types/express';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unreadNotificationCount,
} from './notifications.service';

const router = Router();

router.use(authenticateToken);
router.use(requireAnyPermission('notifications.read', 'notifications.manage'));

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const data = await listNotifications(req.user!.id, req.query.unreadOnly === 'true');
    const unreadCount = await unreadNotificationCount(req.user!.id);
    sendSuccess(res, data, 'Success', 200, { unreadCount });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/read', async (req: AuthRequest, res, next) => {
  try {
    await markNotificationRead(req.params.id, req.user!.id);
    sendSuccess(res, null, 'Notification marked as read');
  } catch (error) {
    next(error);
  }
});

router.post('/mark-all-read', async (req: AuthRequest, res, next) => {
  try {
    await markAllNotificationsRead(req.user!.id);
    sendSuccess(res, null, 'Notifications marked as read');
  } catch (error) {
    next(error);
  }
});

export default router;
