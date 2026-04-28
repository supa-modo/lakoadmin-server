import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../types/express';
import { sendSuccess, sendCreated, sendError } from '../../utils/apiResponse';
import { logAudit } from '../../services/auditService';
import { completeLeadConversion, getLeadConversionPreview } from './leadConversion.service';

function handleConversionError(err: Error, res: Response, next: NextFunction): void {
  if (err.message === 'Lead not found') {
    sendError(res, 'Lead not found', 404);
    return;
  }
  if (err.message.includes('already been converted')) {
    sendError(res, err.message, 409);
    return;
  }
  next(err);
}

export async function getLeadConversionPreviewHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const preview = await getLeadConversionPreview(req.params.id);
    sendSuccess(res, preview);
  } catch (err) {
    handleConversionError(err as Error, res, next);
  }
}

export async function completeLeadConversionHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await completeLeadConversion(req.params.id, req.body, req.user?.id);
    logAudit(req, 'CONVERT', 'Lead', req.params.id, null, {
      clientId: result.client.id,
      onboardingCaseId: result.onboardingCase?.id,
      tasksCreated: result.tasks.length,
    });
    sendCreated(res, result, 'Lead converted successfully');
  } catch (err) {
    handleConversionError(err as Error, res, next);
  }
}
