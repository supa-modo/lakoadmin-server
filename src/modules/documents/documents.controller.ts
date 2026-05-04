import { NextFunction, Response } from 'express';
import { ZodError } from 'zod';
import { AuthRequest } from '../../types/express';
import { buildPaginationMeta, sendCreated, sendError, sendPaginated, sendSuccess } from '../../utils/apiResponse';
import { logAudit } from '../../services/auditService';
import {
  archiveDocument,
  getDocument,
  getDocumentFile,
  getEntityDocuments,
  listDocuments,
  rejectDocument,
  updateDocument,
  uploadDocument,
  verifyDocument,
} from './documents.service';
import {
  createDocumentRequirement,
  listDocumentRequirements,
  updateDocumentRequirement,
} from './documentRequirements.service';
import {
  documentRequirementSchema,
  documentUploadFieldsSchema,
  rejectDocumentSchema,
  updateDocumentSchema,
} from './documents.validation';

function validationMessage(error: ZodError) {
  return error.errors.map((item) => `${item.path.join('.')}: ${item.message}`).join(', ');
}

function handleDocumentError(error: unknown, res: Response, next: NextFunction): void {
  const message = (error as Error).message;
  if (message.includes('not found')) {
    sendError(res, message, 404);
    return;
  }
  if (message.includes('Unsupported') || message.includes('exceeds') || message.includes('No file')) {
    sendError(res, message, 400);
    return;
  }
  next(error);
}

export async function listDocumentsHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { documents, total, page, limit } = await listDocuments(req);
    sendPaginated(res, documents, buildPaginationMeta(total, page, limit));
  } catch (error) {
    next(error);
  }
}

export async function uploadDocumentHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = documentUploadFieldsSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, validationMessage(parsed.error), 422, 'VALIDATION_ERROR');
      return;
    }
    if (!req.file) {
      sendError(res, 'No file uploaded', 400);
      return;
    }
    const document = await uploadDocument(req.file, parsed.data, req.user!.id);
    logAudit(req, 'DOCUMENT_UPLOAD', 'Document', document.id, null, {
      entityType: document.entityType,
      entityId: document.entityId,
      sourceModule: document.sourceModule,
    });
    sendCreated(res, document, 'Document uploaded successfully');
  } catch (error) {
    handleDocumentError(error, res, next);
  }
}

export async function getDocumentHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await getDocument(req.params.id));
  } catch (error) {
    handleDocumentError(error, res, next);
  }
}

export async function updateDocumentHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = updateDocumentSchema.parse(req.body);
    const before = await getDocument(req.params.id);
    const document = await updateDocument(req.params.id, data, req.user!.id);
    logAudit(req, 'UPDATE', 'Document', document.id, before as any, document as any);
    sendSuccess(res, document, 'Document updated');
  } catch (error) {
    handleDocumentError(error, res, next);
  }
}

export async function verifyDocumentHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const document = await verifyDocument(req.params.id, req.user!.id, req.body?.notes);
    logAudit(req, 'DOCUMENT_VERIFY', 'Document', document.id, null, { status: document.status });
    sendSuccess(res, document, 'Document verified');
  } catch (error) {
    handleDocumentError(error, res, next);
  }
}

export async function rejectDocumentHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = rejectDocumentSchema.parse(req.body);
    const document = await rejectDocument(req.params.id, data.reason, req.user!.id, data.notes);
    logAudit(req, 'DOCUMENT_REJECT', 'Document', document.id, null, { reason: data.reason });
    sendSuccess(res, document, 'Document rejected');
  } catch (error) {
    handleDocumentError(error, res, next);
  }
}

export async function archiveDocumentHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const document = await archiveDocument(req.params.id, req.user!.id);
    logAudit(req, 'DOCUMENT_ARCHIVE', 'Document', document.id, null, { status: document.status });
    sendSuccess(res, document, 'Document archived');
  } catch (error) {
    handleDocumentError(error, res, next);
  }
}

export async function entityDocumentsHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await getEntityDocuments(req.params.entityType, req.params.entityId));
  } catch (error) {
    handleDocumentError(error, res, next);
  }
}

export async function downloadDocumentHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const file = await getDocumentFile(req.params.id);
    if (file.redirectUrl) {
      res.redirect(file.redirectUrl);
      return;
    }
    const filename = file.document.originalFileName ?? file.document.fileName ?? file.document.name;
    res.download(file.path!, filename);
  } catch (error) {
    handleDocumentError(error, res, next);
  }
}

export async function listRequirementsHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await listDocumentRequirements(req));
  } catch (error) {
    next(error);
  }
}

export async function createRequirementHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = documentRequirementSchema.parse(req.body);
    const requirement = await createDocumentRequirement(data);
    logAudit(req, 'CREATE', 'DocumentRequirement', requirement.id, null, requirement as any);
    sendCreated(res, requirement, 'Document requirement created');
  } catch (error) {
    next(error);
  }
}

export async function updateRequirementHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = documentRequirementSchema.partial().parse(req.body);
    const requirement = await updateDocumentRequirement(req.params.id, data);
    logAudit(req, 'UPDATE', 'DocumentRequirement', requirement.id, null, requirement as any);
    sendSuccess(res, requirement, 'Document requirement updated');
  } catch (error) {
    next(error);
  }
}
