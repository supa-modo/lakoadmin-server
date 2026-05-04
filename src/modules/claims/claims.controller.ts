import { Response, NextFunction } from 'express';
import { ClaimStatus } from '@prisma/client';
import { sendSuccess, sendCreated, sendError, sendPaginated, buildPaginationMeta } from '../../utils/apiResponse';
import { AuthRequest } from '../../types/express';
import { logAudit } from '../../services/auditService';
import { getDocumentChecklist } from './claimDocuments.service';
import {
  addClaimDocument,
  approveClaim,
  assignClaim,
  closeClaimQuery,
  createClaim,
  createClaimAssessment,
  createClaimQuery,
  createClaimSettlement,
  createManualTask,
  getClaimById,
  getClaimPipeline,
  getClaimStats,
  listClaimTimeline,
  listClaims,
  listEntityClaims,
  rejectClaim,
  rejectClaimDocument,
  respondClaimQuery,
  softDeleteClaim,
  submitClaimQueryToInsurer,
  updateClaim,
  updateClaimAssessment,
  updateClaimDocument,
  updateClaimQuery,
  updateClaimSettlement,
  updateClaimStatus,
  verifyClaimDocument,
  voidClaim,
  markSettlement,
} from './claims.service';

function handleClaimError(res: Response, err: unknown): boolean {
  const message = (err as Error).message;
  if (message.includes('not found')) {
    sendError(res, message, 404);
    return true;
  }
  if (message.includes('permission')) {
    sendError(res, message, 403);
    return true;
  }
  if (
    message.includes('Invalid claim status transition') ||
    message.includes('eligible') ||
    message.includes('reason') ||
    message.includes('duplicate') ||
    message.includes('cannot be edited') ||
    message.includes('Settlement')
  ) {
    sendError(res, message, 400);
    return true;
  }
  return false;
}

export async function getClaims(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { claims, total, page, limit } = await listClaims(req);
    sendPaginated(res, claims, buildPaginationMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
}

export async function getClaim(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await getClaimById(req.params.id));
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function createClaimHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const claim = await createClaim(req.body, req.user?.id, req.user?.permissions ?? []);
    logAudit(req, 'CREATE', 'Claim', claim.id, null, { claimNumber: claim.claimNumber });
    sendCreated(res, claim, 'Claim registered successfully');
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function updateClaimHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const claim = await updateClaim(req.params.id, req.body, req.user?.id);
    logAudit(req, 'UPDATE', 'Claim', claim.id, null, req.body);
    sendSuccess(res, claim, 'Claim updated successfully');
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function deleteClaimHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await softDeleteClaim(req.params.id, req.user?.id);
    logAudit(req, 'DELETE', 'Claim', req.params.id);
    sendSuccess(res, null, 'Claim deleted successfully');
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function voidClaimHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const claim = await voidClaim(req.params.id, req.body.reason, req.user?.id);
    logAudit(req, 'VOID', 'Claim', claim.id, null, { reason: req.body.reason });
    sendSuccess(res, claim, 'Claim voided successfully');
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function assignClaimHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const claim = await assignClaim(req.params.id, req.body.ownerId, req.user?.id, req.body.notes);
    logAudit(req, 'ASSIGN', 'Claim', claim.id, null, req.body);
    sendSuccess(res, claim, 'Claim assigned successfully');
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function statusClaimHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const nextStatus = req.body.status as ClaimStatus;
    const permissions = req.user?.permissions ?? [];
    if (nextStatus === 'VOIDED' && !permissions.includes('claims.delete')) {
      sendError(res, 'Voiding a claim requires claims.delete permission', 403);
      return;
    }
    if (nextStatus === 'CLOSED' && !permissions.includes('claims.close')) {
      sendError(res, 'Closing a claim requires claims.close permission', 403);
      return;
    }
    const claim = await updateClaimStatus(
      req.params.id,
      nextStatus,
      req.body.reason ?? req.body.notes,
      req.user?.id,
      req.body.createFollowUpTask,
    );
    logAudit(req, 'STATUS_CHANGE', 'Claim', claim.id, null, req.body);
    sendSuccess(res, claim, 'Claim status updated successfully');
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function getStatsHandler(_req: AuthRequest, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await getClaimStats());
  } catch (err) {
    next(err);
  }
}

export async function getPipelineHandler(_req: AuthRequest, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await getClaimPipeline());
  } catch (err) {
    next(err);
  }
}

export async function getTimelineHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await listClaimTimeline(req.params.id));
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function listDocumentsHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const claim = await getClaimById(req.params.id);
    sendSuccess(res, claim.documents);
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function createDocumentHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const file = req.file;
    if (!file) {
      sendError(res, 'No file uploaded', 400);
      return;
    }
    const doc = await addClaimDocument(
      req.params.id,
      {
        requirementId: req.body.requirementId || null,
        type: req.body.type || 'OTHER',
        name: req.body.name || file.originalname,
        fileUrl: (file as any).location || file.path || file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        notes: req.body.notes || null,
      },
      req.user?.id,
    );
    logAudit(req, 'DOCUMENT_UPLOAD', 'Claim', req.params.id, null, { documentId: doc.id });
    sendCreated(res, doc, 'Claim document added');
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function updateDocumentHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await updateClaimDocument(req.params.id, req.params.documentId, req.body, req.user?.id));
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function verifyDocumentHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const doc = await verifyClaimDocument(req.params.id, req.params.documentId, req.user?.id);
    logAudit(req, 'DOCUMENT_VERIFY', 'Claim', req.params.id, null, { documentId: doc.id });
    sendSuccess(res, doc, 'Claim document verified');
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function rejectDocumentHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const doc = await rejectClaimDocument(req.params.id, req.params.documentId, req.body.reason, req.user?.id);
    logAudit(req, 'DOCUMENT_REJECT', 'Claim', req.params.id, null, { documentId: doc.id, reason: req.body.reason });
    sendSuccess(res, doc, 'Claim document rejected');
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function checklistHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await getDocumentChecklist(req.params.id));
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function submitToInsurerHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const claim = await updateClaimStatus(req.params.id, 'SUBMITTED_TO_INSURER', req.body.notes ?? 'Submitted to insurer', req.user?.id, true);
    logAudit(req, 'SUBMIT_TO_INSURER', 'Claim', claim.id, null, req.body);
    sendSuccess(res, claim, 'Claim submitted to insurer');
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function insurerReferenceHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const claim = await updateClaim(req.params.id, { insurerClaimNumber: req.body.insurerClaimNumber }, req.user?.id);
    sendSuccess(res, claim, 'Insurer reference updated');
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function queriesHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const claim = await getClaimById(req.params.id);
    sendSuccess(res, claim.queries);
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function createQueryHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const query = await createClaimQuery(req.params.id, req.body, req.user?.id);
    sendCreated(res, query, 'Claim query logged');
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function updateQueryHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await updateClaimQuery(req.params.id, req.params.queryId, req.body));
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function respondQueryHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const query = await respondClaimQuery(req.params.id, req.params.queryId, req.body, req.user?.id);
    logAudit(req, 'QUERY_RESPOND', 'Claim', req.params.id, null, { queryId: req.params.queryId, documentIds: req.body.documentIds ?? [] });
    sendSuccess(res, query, 'Claim query response recorded');
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function submitQueryToInsurerHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const query = await submitClaimQueryToInsurer(req.params.id, req.params.queryId, req.user?.id);
    logAudit(req, 'QUERY_SUBMIT_TO_INSURER', 'Claim', req.params.id, null, { queryId: req.params.queryId });
    sendSuccess(res, query, 'Claim query submitted to insurer');
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function closeQueryHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await closeClaimQuery(req.params.id, req.params.queryId, req.user?.id));
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function createAssessmentHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    sendCreated(res, await createClaimAssessment(req.params.id, req.body, req.user?.id), 'Assessment recorded');
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function updateAssessmentHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await updateClaimAssessment(req.params.id, req.params.assessmentId, req.body), 'Assessment updated');
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function approveHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await approveClaim(req.params.id, req.body.amountApproved, req.user?.id, false, req.body.reason), 'Claim approved');
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function partialApproveHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await approveClaim(req.params.id, req.body.amountApproved, req.user?.id, true, req.body.reason), 'Claim partially approved');
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function rejectHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await rejectClaim(req.params.id, req.body.reason, req.body.category, req.user?.id), 'Claim rejected');
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function appealHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await updateClaimStatus(req.params.id, 'APPEAL', req.body.reason ?? 'Appeal lodged', req.user?.id, true), 'Claim moved to appeal');
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function settlementsHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const claim = await getClaimById(req.params.id);
    sendSuccess(res, claim.settlements);
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function createSettlementHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    sendCreated(res, await createClaimSettlement(req.params.id, req.body, req.user?.id), 'Settlement recorded');
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function updateSettlementHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await updateClaimSettlement(req.params.id, req.params.settlementId, req.body, req.user?.id), 'Settlement updated');
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function markSettlementHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const status = req.path.endsWith('mark-disbursed') ? 'DISBURSED' : 'RECEIVED';
    sendSuccess(res, await markSettlement(req.params.id, req.params.settlementId, status, req.user?.id), 'Settlement updated');
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function tasksHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const claim = await getClaimById(req.params.id);
    sendSuccess(res, claim.tasks);
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function createTaskHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    sendCreated(res, await createManualTask(req.params.id, req.body, req.user?.id), 'Claim task created');
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function clientClaimsHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await listEntityClaims('client', req.params.id));
  } catch (err) {
    if (!handleClaimError(res, err)) next(err);
  }
}

export async function policyClaimsHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await listEntityClaims('policy', req.params.id));
  } catch (err) {
    next(err);
  }
}
