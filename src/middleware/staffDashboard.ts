import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/express';
import { sendError } from '../utils/apiResponse';
import { hasAgentRole, hasStaffDashboardRole } from '../utils/roles';

export function requireStaffDashboardAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  if (hasAgentRole(req.user.roles) && !hasStaffDashboardRole(req.user.roles)) {
    sendError(res, 'Agents must use the agent portal dashboard', 403);
    return;
  }

  next();
}

