import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import {
  createUserSchema,
  updateUserSchema,
  assignRolesSchema,
  listUsersSchema,
} from './users.validation';
import {
  getUsers,
  getUser,
  createUserHandler,
  updateUserHandler,
  deleteUserHandler,
  assignUserRoles,
} from './users.controller';

const router = Router();

router.use(authenticateToken);

router.get('/', requirePermission('users.read'), validate(listUsersSchema, 'query'), getUsers);
router.post('/', requirePermission('users.create'), validate(createUserSchema), createUserHandler);
router.get('/:id', requirePermission('users.read'), getUser);
router.patch('/:id', requirePermission('users.update'), validate(updateUserSchema), updateUserHandler);
router.delete('/:id', requirePermission('users.delete'), deleteUserHandler);
router.post('/:id/roles', requirePermission('users.update'), validate(assignRolesSchema), assignUserRoles);

export default router;
