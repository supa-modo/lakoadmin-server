import { Response, NextFunction } from 'express';
import {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  softDeleteUser,
  assignRoles,
} from './users.service';
import { sendSuccess, sendCreated, sendError, buildPaginationMeta, sendPaginated } from '../../utils/apiResponse';
import { AuthRequest } from '../../types/express';
import { logAudit } from '../../services/auditService';

export async function getUsers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { users, total, page, limit } = await listUsers(req);
    const pagination = buildPaginationMeta(total, page, limit);
    sendPaginated(res, users, pagination);
  } catch (err) {
    next(err);
  }
}

export async function getUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await getUserById(req.params.id);
    sendSuccess(res, user);
  } catch (err) {
    if ((err as Error).message === 'User not found') {
      sendError(res, 'User not found', 404);
    } else {
      next(err);
    }
  }
}

export async function createUserHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await createUser({ ...req.body, createdById: req.user?.id });
    logAudit(req, 'CREATE', 'User', user.id, null, { id: user.id, email: user.email });
    sendCreated(res, user, 'User created successfully');
  } catch (err) {
    if ((err as Error).message === 'Email already in use') {
      sendError(res, 'Email already in use', 409);
    } else {
      next(err);
    }
  }
}

export async function updateUserHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await updateUser(req.params.id, req.body);
    logAudit(req, 'UPDATE', 'User', user.id, null, req.body);
    sendSuccess(res, user, 'User updated successfully');
  } catch (err) {
    if ((err as Error).message === 'User not found') {
      sendError(res, 'User not found', 404);
    } else {
      next(err);
    }
  }
}

export async function deleteUserHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user?.id === req.params.id) {
      sendError(res, 'Cannot delete your own account', 400);
      return;
    }
    await softDeleteUser(req.params.id);
    logAudit(req, 'DELETE', 'User', req.params.id);
    sendSuccess(res, null, 'User deleted successfully');
  } catch (err) {
    if ((err as Error).message === 'User not found') {
      sendError(res, 'User not found', 404);
    } else {
      next(err);
    }
  }
}

export async function assignUserRoles(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { roleIds } = req.body;
    const user = await assignRoles(req.params.id, roleIds, req.user?.id);
    logAudit(req, 'ASSIGN_ROLES', 'User', req.params.id, null, { roleIds });
    sendSuccess(res, user, 'Roles assigned successfully');
  } catch (err) {
    if ((err as Error).message === 'User not found') {
      sendError(res, 'User not found', 404);
    } else {
      next(err);
    }
  }
}
