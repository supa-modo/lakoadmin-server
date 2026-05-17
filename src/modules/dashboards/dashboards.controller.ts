import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../types/express';
import { sendSuccess } from '../../utils/apiResponse';
import { getStaffDashboard, listDashboardRoles } from './dashboards.service';

export async function listDashboardRolesHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await listDashboardRoles(req.user!));
  } catch (error) {
    next(error);
  }
}

export async function getStaffDashboardHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await getStaffDashboard(req.params.role as any, req.user!));
  } catch (error) {
    next(error);
  }
}
