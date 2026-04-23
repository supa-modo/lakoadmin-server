import { Response, NextFunction } from 'express';
import {
  listLeads,
  getLeadById,
  createLead,
  updateLead,
  softDeleteLead,
  assignLead,
  updateLeadStatus,
  convertLeadToClient,
  logLeadActivity,
  checkDuplicateLead,
} from './leads.service';
import { sendSuccess, sendCreated, sendError, buildPaginationMeta, sendPaginated } from '../../utils/apiResponse';
import { AuthRequest } from '../../types/express';
import { logAudit } from '../../services/auditService';

export async function getLeads(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await listLeads(req);

    if ('leads' in result) {
      const listResult = result as {
        leads: any[];
        total: number;
        page: number;
        limit: number;
      };
      const { leads, total, page, limit } = listResult;
      const pagination = buildPaginationMeta(total, page, limit);
      sendPaginated(res, leads, pagination);
    } else {
      sendSuccess(res, result);
    }
  } catch (err) {
    next(err);
  }
}

export async function getLead(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const lead = await getLeadById(req.params.id);
    sendSuccess(res, lead);
  } catch (err) {
    if ((err as Error).message === 'Lead not found') {
      sendError(res, 'Lead not found', 404);
    } else {
      next(err);
    }
  }
}

export async function createLeadHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const lead = await createLead(req.body, req.user?.id);
    logAudit(req, 'CREATE', 'Lead', lead.id, null, { id: lead.id, name: lead.name });
    sendCreated(res, lead, 'Lead created successfully');
  } catch (err) {
    if ((err as Error).message === 'A lead with this email already exists') {
      sendError(res, 'A lead with this email already exists', 409);
    } else {
      next(err);
    }
  }
}

export async function updateLeadHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const lead = await updateLead(req.params.id, req.body);
    logAudit(req, 'UPDATE', 'Lead', lead.id, null, req.body);
    sendSuccess(res, lead, 'Lead updated successfully');
  } catch (err) {
    if ((err as Error).message === 'Lead not found') {
      sendError(res, 'Lead not found', 404);
    } else {
      next(err);
    }
  }
}

export async function deleteLeadHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await softDeleteLead(req.params.id);
    logAudit(req, 'DELETE', 'Lead', req.params.id);
    sendSuccess(res, null, 'Lead deleted successfully');
  } catch (err) {
    if ((err as Error).message === 'Lead not found') {
      sendError(res, 'Lead not found', 404);
    } else {
      next(err);
    }
  }
}

export async function assignLeadHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { assignedToId } = req.body;
    const lead = await assignLead(req.params.id, assignedToId, req.user?.id);
    logAudit(req, 'ASSIGN', 'Lead', req.params.id, null, { assignedToId });
    sendSuccess(res, lead, 'Lead assigned successfully');
  } catch (err) {
    if ((err as Error).message === 'Lead not found') {
      sendError(res, 'Lead not found', 404);
    } else if ((err as Error).message === 'User not found') {
      sendError(res, 'User not found', 404);
    } else {
      next(err);
    }
  }
}

export async function updateLeadStatusHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status, lostReason } = req.body;
    const lead = await updateLeadStatus(req.params.id, status, lostReason, req.user?.id);
    logAudit(req, 'UPDATE_STATUS', 'Lead', req.params.id, null, { status, lostReason });
    sendSuccess(res, lead, 'Lead status updated successfully');
  } catch (err) {
    if ((err as Error).message === 'Lead not found') {
      sendError(res, 'Lead not found', 404);
    } else {
      next(err);
    }
  }
}

export async function convertToClientHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { clientType, relationshipManagerId } = req.body;
    const result = await convertLeadToClient(req.params.id, clientType, relationshipManagerId, req.user?.id);
    logAudit(req, 'CONVERT', 'Lead', req.params.id, null, { clientId: result.client.id });
    sendSuccess(res, result, 'Lead converted to client successfully');
  } catch (err) {
    if ((err as Error).message === 'Lead not found') {
      sendError(res, 'Lead not found', 404);
    } else if ((err as Error).message === 'Lead has already been converted to a client') {
      sendError(res, 'Lead has already been converted to a client', 409);
    } else {
      next(err);
    }
  }
}

export async function logActivityHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { type, description, metadata } = req.body;
    await logLeadActivity(req.params.id, type, description, metadata, req.user?.id);
    sendSuccess(res, null, 'Activity logged successfully');
  } catch (err) {
    if ((err as Error).message === 'Lead not found') {
      sendError(res, 'Lead not found', 404);
    } else {
      next(err);
    }
  }
}

export async function checkDuplicateHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, phone } = req.query;
    const duplicate = await checkDuplicateLead(email as string, phone as string);
    sendSuccess(res, { duplicate: !!duplicate, lead: duplicate });
  } catch (err) {
    next(err);
  }
}
