import { Response, NextFunction } from 'express';
import {
  listOnboardingCases,
  getOnboardingCaseById,
  createOnboardingCase,
  updateOnboardingCase,
  uploadDocument,
  verifyDocument,
  submitOnboarding,
  approveOnboarding,
  rejectOnboarding,
  startClientOnboarding,
  createPolicyFromOnboardingCase,
} from './onboarding.service';
import { sendSuccess, sendCreated, sendError, buildPaginationMeta, sendPaginated } from '../../utils/apiResponse';
import { AuthRequest } from '../../types/express';
import { logAudit } from '../../services/auditService';

export async function getOnboardingCases(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { cases, total, page, limit } = await listOnboardingCases(req);
    const pagination = buildPaginationMeta(total, page, limit);
    sendPaginated(res, cases, pagination);
  } catch (err) {
    next(err);
  }
}

export async function getOnboardingCase(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const onboardingCase = await getOnboardingCaseById(req.params.id);
    sendSuccess(res, onboardingCase);
  } catch (err) {
    if ((err as Error).message === 'Onboarding case not found') {
      sendError(res, 'Onboarding case not found', 404);
    } else {
      next(err);
    }
  }
}

export async function createOnboardingHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const onboardingCase = await createOnboardingCase(req.body, req.user?.id);
    logAudit(req, 'CREATE', 'OnboardingCase', onboardingCase.id, null, { id: onboardingCase.id, caseNumber: onboardingCase.caseNumber });
    sendCreated(res, onboardingCase, 'Onboarding case created successfully');
  } catch (err) {
    if ((err as Error).message === 'Client not found') {
      sendError(res, 'Client not found', 404);
    } else if ((err as Error).message === 'Client already has an active onboarding case') {
      sendError(res, 'Client already has an active onboarding case', 409);
    } else {
      next(err);
    }
  }
}

export async function updateOnboardingHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const onboardingCase = await updateOnboardingCase(req.params.id, req.body);
    logAudit(req, 'UPDATE', 'OnboardingCase', onboardingCase.id, null, req.body);
    sendSuccess(res, onboardingCase, 'Onboarding case updated successfully');
  } catch (err) {
    if ((err as Error).message === 'Onboarding case not found') {
      sendError(res, 'Onboarding case not found', 404);
    } else {
      next(err);
    }
  }
}

export async function uploadDocumentHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) {
      sendError(res, 'No file uploaded', 400);
      return;
    }

    const { documentType, expiryDate } = req.body;
    const document = await uploadDocument(req.params.id, documentType, req.file, expiryDate);
    logAudit(req, 'UPLOAD', 'OnboardingDocument', document.id, null, { caseId: req.params.id, documentType });
    sendCreated(res, document, 'Document uploaded successfully');
  } catch (err) {
    if ((err as Error).message === 'Onboarding case not found') {
      sendError(res, 'Onboarding case not found', 404);
    } else if ((err as Error).message === 'Cannot upload documents to a closed onboarding case') {
      sendError(res, 'Cannot upload documents to a closed onboarding case', 400);
    } else {
      next(err);
    }
  }
}

export async function verifyDocumentHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status, rejectionReason } = req.body;
    const document = await verifyDocument(req.params.id, req.params.docId, status, rejectionReason, req.user?.id);
    logAudit(req, 'VERIFY', 'OnboardingDocument', document.id, null, { status, rejectionReason });
    sendSuccess(res, document, 'Document verification updated');
  } catch (err) {
    if ((err as Error).message === 'Document not found') {
      sendError(res, 'Document not found', 404);
    } else {
      next(err);
    }
  }
}

export async function submitOnboardingHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const onboardingCase = await submitOnboarding(req.params.id);
    logAudit(req, 'SUBMIT', 'OnboardingCase', req.params.id);
    sendSuccess(res, onboardingCase, 'Onboarding case submitted for review');
  } catch (err) {
    if ((err as Error).message === 'Onboarding case not found') {
      sendError(res, 'Onboarding case not found', 404);
    } else if ((err as Error).message.includes('cannot be submitted')) {
      sendError(res, (err as Error).message, 400);
    } else if ((err as Error).message === 'Cannot submit onboarding without documents') {
      sendError(res, 'Cannot submit onboarding without documents', 400);
    } else {
      next(err);
    }
  }
}

export async function approveOnboardingHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { reviewNotes } = req.body;
    const onboardingCase = await approveOnboarding(req.params.id, reviewNotes, req.user?.id);
    logAudit(req, 'APPROVE', 'OnboardingCase', req.params.id, null, { reviewNotes });
    sendSuccess(res, onboardingCase, 'Onboarding case approved');
  } catch (err) {
    if ((err as Error).message === 'Onboarding case not found') {
      sendError(res, 'Onboarding case not found', 404);
    } else if ((err as Error).message === 'Only cases under review can be approved') {
      sendError(res, 'Only cases under review can be approved', 400);
    } else {
      next(err);
    }
  }
}

export async function rejectOnboardingHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { rejectionReason } = req.body;
    const onboardingCase = await rejectOnboarding(req.params.id, rejectionReason, req.user?.id);
    logAudit(req, 'REJECT', 'OnboardingCase', req.params.id, null, { rejectionReason });
    sendSuccess(res, onboardingCase, 'Onboarding case rejected');
  } catch (err) {
    if ((err as Error).message === 'Onboarding case not found') {
      sendError(res, 'Onboarding case not found', 404);
    } else if ((err as Error).message === 'Only cases under review can be rejected') {
      sendError(res, 'Only cases under review can be rejected', 400);
    } else {
      next(err);
    }
  }
}

export async function startClientOnboardingHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const onboardingCase = await startClientOnboarding(req.params.clientId, req.body, req.user?.id);
    logAudit(req, 'CREATE', 'OnboardingCase', onboardingCase.id, null, {
      id: onboardingCase.id,
      caseNumber: onboardingCase.caseNumber,
      clientId: req.params.clientId,
      guided: true,
    });
    sendCreated(res, onboardingCase, 'Onboarding started successfully');
  } catch (err) {
    if ((err as Error).message === 'Client not found') {
      sendError(res, 'Client not found', 404);
    } else if ((err as Error).message === 'Client already has an active onboarding case') {
      sendError(res, 'Client already has an active onboarding case', 409);
    } else {
      next(err);
    }
  }
}

export async function createPolicyFromOnboardingHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await createPolicyFromOnboardingCase(req.params.id, req.body, req.user?.id);
    logAudit(req, 'CREATE', 'Policy', result.policy.id, null, {
      policyNumber: result.policy.policyNumber,
      onboardingCaseId: req.params.id,
      underwriterTaskId: result.underwriterTask?.id,
    });
    sendCreated(res, result, 'Policy created from onboarding case');
  } catch (err) {
    const message = (err as Error).message;
    if (message === 'Onboarding case not found') {
      sendError(res, message, 404);
    } else if (
      message.includes('must be selected') ||
      message.includes('sufficiently complete') ||
      message.includes('Base premium')
    ) {
      sendError(res, message, 400);
    } else {
      next(err);
    }
  }
}
