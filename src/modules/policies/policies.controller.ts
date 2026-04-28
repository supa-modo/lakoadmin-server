import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../types/express';
import { sendSuccess, sendCreated, sendError, buildPaginationMeta, sendPaginated } from '../../utils/apiResponse';
import { logAudit } from '../../services/auditService';
import {
  listPolicies,
  getPolicyById,
  getPolicyStats,
  getPolicyActivationReadiness,
  createPolicy,
  updatePolicy,
  activatePolicy,
  suspendPolicy,
  reinstatePolicy,
  cancelPolicy,
  softDeletePolicy,
  listMembers,
  addMember,
  updateMember,
  removeMember,
  listEndorsements,
  createEndorsement,
  approveEndorsement,
  rejectEndorsement,
  listDocuments,
  createDocument,
  generateDocument,
  deleteDocument,
  listEvents,
  createRenewal,
  listRenewalsDue,
} from './policies.service';

// ─── Helpers ──────────────────────────────────────────────

function handleNotFound(err: Error, res: Response, next: NextFunction, message = 'Not found') {
  const msg = err.message;
  if (msg.includes('not found') || msg.includes('Not found')) {
    sendError(res, msg, 404);
  } else if (msg.includes('Cannot') || msg.includes('already') || msg.includes('Only')) {
    sendError(res, msg, 409);
  } else {
    next(err);
  }
}

// ─── Policy CRUD ──────────────────────────────────────────

export async function getPolicies(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { policies, total, page, limit } = await listPolicies(req);
    const pagination = buildPaginationMeta(total, page, limit);
    sendPaginated(res, policies, pagination);
  } catch (err) {
    next(err);
  }
}

export async function getPoliciesStats(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const stats = await getPolicyStats();
    sendSuccess(res, stats);
  } catch (err) {
    next(err);
  }
}

export async function getPolicy(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const policy = await getPolicyById(req.params.id);
    sendSuccess(res, policy);
  } catch (err) {
    handleNotFound(err as Error, res, next);
  }
}

export async function getPolicyActivationReadinessHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const readiness = await getPolicyActivationReadiness(req.params.id);
    sendSuccess(res, readiness);
  } catch (err) {
    handleNotFound(err as Error, res, next);
  }
}

export async function createPolicyHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const policy = await createPolicy(req.body, req.user!.id);
    logAudit(req, 'CREATE', 'Policy', policy.id, null, { policyNumber: policy.policyNumber, clientId: policy.clientId });
    sendCreated(res, policy, 'Policy created successfully');
  } catch (err) {
    const message = (err as Error).message;
    if (message.startsWith('Activation blocked.')) {
      sendError(res, message, 400);
      return;
    }
    handleNotFound(err as Error, res, next);
  }
}

export async function updatePolicyHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const before = await getPolicyById(req.params.id).catch(() => null);
    const policy = await updatePolicy(req.params.id, req.body, req.user!.id);
    logAudit(req, 'UPDATE', 'Policy', policy.id, before, policy);
    sendSuccess(res, policy, 'Policy updated successfully');
  } catch (err) {
    handleNotFound(err as Error, res, next);
  }
}

export async function deletePolicyHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await softDeletePolicy(req.params.id, req.user!.id);
    logAudit(req, 'DELETE', 'Policy', req.params.id, null, null);
    sendSuccess(res, null, 'Policy deleted successfully');
  } catch (err) {
    handleNotFound(err as Error, res, next);
  }
}

// ─── Status Transitions ───────────────────────────────────

export async function activatePolicyHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const policy = await activatePolicy(req.params.id, req.user!.id);
    logAudit(req, 'UPDATE', 'Policy', policy.id, { status: 'DRAFT' }, { status: 'ACTIVE' });
    sendSuccess(res, policy, 'Policy activated successfully');
  } catch (err) {
    handleNotFound(err as Error, res, next);
  }
}

export async function suspendPolicyHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const policy = await suspendPolicy(req.params.id, req.body.reason, req.user!.id);
    logAudit(req, 'UPDATE', 'Policy', policy.id, { status: 'ACTIVE' }, { status: 'SUSPENDED', reason: req.body.reason });
    sendSuccess(res, policy, 'Policy suspended successfully');
  } catch (err) {
    handleNotFound(err as Error, res, next);
  }
}

export async function reinstatePolicyHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const policy = await reinstatePolicy(req.params.id, req.user!.id);
    logAudit(req, 'UPDATE', 'Policy', policy.id, { status: 'SUSPENDED' }, { status: 'ACTIVE' });
    sendSuccess(res, policy, 'Policy reinstated successfully');
  } catch (err) {
    handleNotFound(err as Error, res, next);
  }
}

export async function cancelPolicyHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const policy = await cancelPolicy(req.params.id, req.body.reason, req.user!.id);
    logAudit(req, 'UPDATE', 'Policy', policy.id, null, { status: 'CANCELLED', reason: req.body.reason });
    sendSuccess(res, policy, 'Policy cancelled successfully');
  } catch (err) {
    handleNotFound(err as Error, res, next);
  }
}

// ─── Members ──────────────────────────────────────────────

export async function getMembersHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const members = await listMembers(req.params.id);
    sendSuccess(res, members);
  } catch (err) {
    handleNotFound(err as Error, res, next);
  }
}

export async function addMemberHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const member = await addMember(req.params.id, req.body, req.user!.id);
    logAudit(req, 'CREATE', 'PolicyMember', member.id, null, { policyId: req.params.id, name: member.name });
    sendCreated(res, member, 'Member added successfully');
  } catch (err) {
    handleNotFound(err as Error, res, next);
  }
}

export async function updateMemberHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const member = await updateMember(req.params.id, req.params.memberId, req.body, req.user!.id);
    logAudit(req, 'UPDATE', 'PolicyMember', member.id, null, member);
    sendSuccess(res, member, 'Member updated successfully');
  } catch (err) {
    handleNotFound(err as Error, res, next);
  }
}

export async function removeMemberHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await removeMember(req.params.id, req.params.memberId, req.user!.id);
    logAudit(req, 'DELETE', 'PolicyMember', req.params.memberId, null, null);
    sendSuccess(res, null, 'Member removed successfully');
  } catch (err) {
    handleNotFound(err as Error, res, next);
  }
}

// ─── Endorsements ─────────────────────────────────────────

export async function getEndorsementsHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const endorsements = await listEndorsements(req.params.id);
    sendSuccess(res, endorsements);
  } catch (err) {
    handleNotFound(err as Error, res, next);
  }
}

export async function createEndorsementHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const endorsement = await createEndorsement(req.params.id, req.body, req.user!.id);
    logAudit(req, 'CREATE', 'PolicyEndorsement', endorsement.id, null, { policyId: req.params.id, type: endorsement.type });
    sendCreated(res, endorsement, 'Endorsement created successfully');
  } catch (err) {
    handleNotFound(err as Error, res, next);
  }
}

export async function approveEndorsementHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const endorsement = await approveEndorsement(req.params.id, req.params.endorsementId, req.user!.id);
    logAudit(req, 'UPDATE', 'PolicyEndorsement', endorsement.id, { status: 'PENDING' }, { status: 'APPROVED' });
    sendSuccess(res, endorsement, 'Endorsement approved successfully');
  } catch (err) {
    handleNotFound(err as Error, res, next);
  }
}

export async function rejectEndorsementHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const endorsement = await rejectEndorsement(req.params.id, req.params.endorsementId, req.body.reason, req.user!.id);
    logAudit(req, 'UPDATE', 'PolicyEndorsement', endorsement.id, { status: 'PENDING' }, { status: 'REJECTED' });
    sendSuccess(res, endorsement, 'Endorsement rejected');
  } catch (err) {
    handleNotFound(err as Error, res, next);
  }
}

// ─── Documents ────────────────────────────────────────────

export async function getDocumentsHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const documents = await listDocuments(req.params.id);
    sendSuccess(res, documents);
  } catch (err) {
    handleNotFound(err as Error, res, next);
  }
}

export async function uploadDocumentHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { type, name } = req.body;
    const file = req.file;

    if (!file) {
      sendError(res, 'No file uploaded', 400);
      return;
    }

    const doc = await createDocument(
      req.params.id,
      {
        type: type || 'OTHER',
        name: name || file.originalname,
        fileUrl: (file as any).location || file.path || file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
      },
      req.user!.id
    );

    logAudit(req, 'CREATE', 'PolicyDocument', doc.id, null, { policyId: req.params.id, type: doc.type });
    sendCreated(res, doc, 'Document uploaded successfully');
  } catch (err) {
    handleNotFound(err as Error, res, next);
  }
}

export async function generateDocumentHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { type } = req.body;
    const doc = await generateDocument(req.params.id, type, req.user!.id);
    logAudit(req, 'CREATE', 'PolicyDocument', doc.id, null, { policyId: req.params.id, type: doc.type, generated: true });
    sendCreated(res, doc, 'Document generated successfully');
  } catch (err) {
    handleNotFound(err as Error, res, next);
  }
}

export async function deleteDocumentHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await deleteDocument(req.params.id, req.params.documentId, req.user!.id);
    logAudit(req, 'DELETE', 'PolicyDocument', req.params.documentId, null, null);
    sendSuccess(res, null, 'Document deleted successfully');
  } catch (err) {
    handleNotFound(err as Error, res, next);
  }
}

// ─── Events / History ─────────────────────────────────────

export async function getEventsHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const events = await listEvents(req.params.id);
    sendSuccess(res, events);
  } catch (err) {
    handleNotFound(err as Error, res, next);
  }
}

// ─── Renewals ─────────────────────────────────────────────

export async function createRenewalHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const renewal = await createRenewal(req.params.id, req.body, req.user!.id);
    logAudit(req, 'CREATE', 'Policy', renewal.id, null, { policyNumber: renewal.policyNumber, renewedFrom: req.params.id });
    sendCreated(res, renewal, 'Renewal policy created successfully');
  } catch (err) {
    handleNotFound(err as Error, res, next);
  }
}

export async function getRenewalsDueHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { policies, total, page, limit } = await listRenewalsDue(req);
    const pagination = buildPaginationMeta(total, page, limit);
    sendPaginated(res, policies, pagination);
  } catch (err) {
    next(err);
  }
}
