import { Response, NextFunction } from 'express';
import { listRoles, getRoleById, createRole, updateRole, setRolePermissions } from './roles.service';
import { sendSuccess, sendCreated, sendError } from '../../utils/apiResponse';
import { AuthRequest } from '../../types/express';
import { logAudit } from '../../services/auditService';
import { z } from 'zod';

const createRoleSchema = z.object({
  name: z.string().min(1).regex(/^[a-zA-Z_]+$/, 'Role name can only contain letters and underscores'),
  displayName: z.string().min(1),
  description: z.string().optional(),
  permissionIds: z.array(z.string().uuid()).optional(),
});

const updateRoleSchema = z.object({
  displayName: z.string().min(1).optional(),
  description: z.string().optional(),
});

const setPermissionsSchema = z.object({
  permissionIds: z.array(z.string().uuid()),
});

export async function getRoles(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const roles = await listRoles();
    sendSuccess(res, roles);
  } catch (err) {
    next(err);
  }
}

export async function getRole(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const role = await getRoleById(req.params.id);
    sendSuccess(res, role);
  } catch (err) {
    if ((err as Error).message === 'Role not found') sendError(res, 'Role not found', 404);
    else next(err);
  }
}

export async function createRoleHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = createRoleSchema.parse(req.body);
    const role = await createRole(data);
    logAudit(req, 'CREATE', 'Role', role.id, null, { name: role.name });
    sendCreated(res, role, 'Role created successfully');
  } catch (err) {
    if ((err as Error).message === 'Role name already exists') sendError(res, 'Role name already exists', 409);
    else next(err);
  }
}

export async function updateRoleHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = updateRoleSchema.parse(req.body);
    const role = await updateRole(req.params.id, data);
    logAudit(req, 'UPDATE', 'Role', role.id, null, data);
    sendSuccess(res, role, 'Role updated');
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'Role not found') sendError(res, msg, 404);
    else if (msg === 'System roles cannot be modified') sendError(res, msg, 403);
    else next(err);
  }
}

export async function updateRolePermissions(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { permissionIds } = setPermissionsSchema.parse(req.body);
    const role = await setRolePermissions(req.params.id, permissionIds);
    logAudit(req, 'UPDATE_PERMISSIONS', 'Role', req.params.id, null, { permissionIds });
    sendSuccess(res, role, 'Permissions updated');
  } catch (err) {
    if ((err as Error).message === 'Role not found') sendError(res, 'Role not found', 404);
    else next(err);
  }
}
