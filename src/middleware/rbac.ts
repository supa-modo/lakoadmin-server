import { Response, NextFunction } from 'express';
import { sendError } from '../utils/apiResponse';
import { AuthRequest } from '../types/express';

function hasPermission(userPermissions: string[], required: string[]): boolean {
  return required.every((perm) => userPermissions.includes(perm));
}

function hasAnyPermission(userPermissions: string[], required: string[]): boolean {
  return required.some((perm) => userPermissions.includes(perm));
}

function hasRole(userRoles: string[], required: string[]): boolean {
  return required.some((role) => userRoles.includes(role));
}

/**
 * Require ALL of the specified permissions
 */
export function requirePermission(...permissions: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 'Unauthorized', 401);
      return;
    }

    if (!hasPermission(req.user.permissions, permissions)) {
      sendError(res, 'Insufficient permissions', 403);
      return;
    }

    next();
  };
}

/**
 * Require ANY of the specified permissions
 */
export function requireAnyPermission(...permissions: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 'Unauthorized', 401);
      return;
    }

    if (!hasAnyPermission(req.user.permissions, permissions)) {
      sendError(res, 'Insufficient permissions', 403);
      return;
    }

    next();
  };
}

/**
 * Require ANY of the specified roles
 */
export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 'Unauthorized', 401);
      return;
    }

    if (!hasRole(req.user.roles, roles)) {
      sendError(res, 'Insufficient role', 403);
      return;
    }

    next();
  };
}
