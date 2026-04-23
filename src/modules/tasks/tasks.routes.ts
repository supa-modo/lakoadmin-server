import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import {
  createTaskSchema,
  updateTaskSchema,
  listTasksSchema,
  createTaskActivitySchema,
} from './tasks.validation';
import {
  getTasks,
  getTask,
  createTaskHandler,
  updateTaskHandler,
  completeTaskHandler,
  reopenTaskHandler,
  deleteTaskHandler,
  getTaskActivitiesHandler,
  createTaskActivityHandler,
} from './tasks.controller';

const router = Router();

router.use(authenticateToken);

router.get('/', requirePermission('tasks.read'), validate(listTasksSchema, 'query'), getTasks);
router.post('/', requirePermission('tasks.create'), validate(createTaskSchema), createTaskHandler);
router.get('/:id', requirePermission('tasks.read'), getTask);
router.patch('/:id', requirePermission('tasks.update'), validate(updateTaskSchema), updateTaskHandler);
router.post('/:id/complete', requirePermission('tasks.complete'), completeTaskHandler);
router.post('/:id/reopen', requirePermission('tasks.update'), reopenTaskHandler);
router.get('/:id/activities', requirePermission('tasks.read'), getTaskActivitiesHandler);
router.post(
  '/:id/activities',
  requirePermission('tasks.update'),
  validate(createTaskActivitySchema),
  createTaskActivityHandler,
);
router.delete('/:id', requirePermission('tasks.delete'), deleteTaskHandler);

export default router;
