import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { z } from 'zod';
import { authenticateToken } from '../../middleware/auth';
import { requireAnyPermission, requirePermission } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import {
  appealHandler,
  assignClaimHandler,
  checklistHandler,
  closeQueryHandler,
  createAssessmentHandler,
  createClaimHandler,
  createDocumentHandler,
  createQueryHandler,
  createSettlementHandler,
  createTaskHandler,
  deleteClaimHandler,
  getClaim,
  getClaims,
  getPipelineHandler,
  getStatsHandler,
  getTimelineHandler,
  insurerReferenceHandler,
  listDocumentsHandler,
  markSettlementHandler,
  partialApproveHandler,
  approveHandler,
  queriesHandler,
  rejectDocumentHandler,
  rejectHandler,
  respondQueryHandler,
  settlementsHandler,
  statusClaimHandler,
  submitQueryToInsurerHandler,
  submitToInsurerHandler,
  tasksHandler,
  updateAssessmentHandler,
  updateClaimHandler,
  updateDocumentHandler,
  updateQueryHandler,
  updateSettlementHandler,
  verifyDocumentHandler,
  voidClaimHandler,
} from './claims.controller';
import {
  assessmentSchema,
  assignClaimSchema,
  createClaimSchema,
  listClaimsSchema,
  querySchema,
  rejectDocumentSchema,
  respondQuerySchema,
  settlementSchema,
  taskSchema,
  updateClaimSchema,
  updateClaimStatusSchema,
  updateDocumentSchema,
  updateQuerySchema,
} from './claims.validation';
import { entityCommunicationsHandler } from '../communications/communications.controller';

const router = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, 'uploads/claims/'),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || file.mimetype === 'application/octet-stream';
    if (extname && mimetype) return cb(null, true);
    return cb(new Error('Only image and document files are allowed'));
  },
});

router.use(authenticateToken);

const reasonSchema = z.object({ reason: z.string().min(3), category: z.string().optional().nullable() });
const approveSchema = z.object({ amountApproved: z.number().nonnegative(), reason: z.string().optional().nullable() });
const insurerReferenceSchema = z.object({ insurerClaimNumber: z.string().min(1) });
const voidSchema = z.object({ reason: z.string().min(5) });
const submitSchema = z.object({ notes: z.string().optional().nullable() }).optional();

router.get('/', requirePermission('claims.read'), validate(listClaimsSchema, 'query'), getClaims);
router.post('/', requirePermission('claims.create'), validate(createClaimSchema), createClaimHandler);
router.get('/stats', requirePermission('claims.reports.read'), getStatsHandler);
router.get('/pipeline', requirePermission('claims.read'), getPipelineHandler);
router.get('/:id', requirePermission('claims.read'), getClaim);
router.get('/:id/communications', requirePermission('communications.read'), entityCommunicationsHandler);
router.patch('/:id', requirePermission('claims.update'), validate(updateClaimSchema), updateClaimHandler);
router.delete('/:id', requirePermission('claims.delete'), deleteClaimHandler);
router.post('/:id/void', requirePermission('claims.delete'), validate(voidSchema), voidClaimHandler);
router.post('/:id/assign', requirePermission('claims.assign'), validate(assignClaimSchema), assignClaimHandler);
router.post('/:id/status', requirePermission('claims.status.update'), validate(updateClaimStatusSchema), statusClaimHandler);
router.get('/:id/timeline', requirePermission('claims.read'), getTimelineHandler);

router.get('/:id/documents', requirePermission('claims.read'), listDocumentsHandler);
router.post('/:id/documents', requirePermission('claims.documents.upload'), upload.single('file'), createDocumentHandler);
router.patch('/:id/documents/:documentId', requirePermission('claims.documents.upload'), validate(updateDocumentSchema), updateDocumentHandler);
router.post('/:id/documents/:documentId/verify', requirePermission('claims.documents.verify'), verifyDocumentHandler);
router.post('/:id/documents/:documentId/reject', requirePermission('claims.documents.verify'), validate(rejectDocumentSchema), rejectDocumentHandler);
router.get('/:id/document-checklist', requirePermission('claims.read'), checklistHandler);

router.post('/:id/submit-to-insurer', requirePermission('claims.submit_to_insurer'), validate(submitSchema), submitToInsurerHandler);
router.patch('/:id/insurer-reference', requirePermission('claims.update'), validate(insurerReferenceSchema), insurerReferenceHandler);

router.get('/:id/queries', requirePermission('claims.read'), queriesHandler);
router.post('/:id/queries', requirePermission('claims.update'), validate(querySchema), createQueryHandler);
router.patch('/:id/queries/:queryId', requirePermission('claims.update'), validate(updateQuerySchema), updateQueryHandler);
router.post('/:id/queries/:queryId/respond', requirePermission('claims.update'), validate(respondQuerySchema), respondQueryHandler);
router.post('/:id/queries/:queryId/submit-to-insurer', requirePermission('claims.submit_to_insurer'), submitQueryToInsurerHandler);
router.post('/:id/queries/:queryId/close', requirePermission('claims.update'), closeQueryHandler);

router.post('/:id/assessment', requirePermission('claims.assessment.manage'), validate(assessmentSchema), createAssessmentHandler);
router.patch('/:id/assessment/:assessmentId', requirePermission('claims.assessment.manage'), validate(assessmentSchema.partial()), updateAssessmentHandler);

router.post('/:id/approve', requirePermission('claims.status.update'), validate(approveSchema), approveHandler);
router.post('/:id/partially-approve', requirePermission('claims.status.update'), validate(approveSchema), partialApproveHandler);
router.post('/:id/reject', requirePermission('claims.status.update'), validate(reasonSchema), rejectHandler);
router.post('/:id/appeal', requirePermission('claims.status.update'), validate(reasonSchema.partial()), appealHandler);

router.get('/:id/settlements', requireAnyPermission('claims.settlement.manage', 'claims.read'), settlementsHandler);
router.post('/:id/settlements', requirePermission('claims.settlement.manage'), validate(settlementSchema), createSettlementHandler);
router.patch('/:id/settlements/:settlementId', requirePermission('claims.settlement.manage'), validate(settlementSchema.partial()), updateSettlementHandler);
router.post('/:id/settlements/:settlementId/mark-received', requirePermission('claims.settlement.manage'), markSettlementHandler);
router.post('/:id/settlements/:settlementId/mark-disbursed', requirePermission('claims.settlement.manage'), markSettlementHandler);

router.get('/:id/tasks', requirePermission('claims.read'), tasksHandler);
router.post('/:id/tasks', requirePermission('tasks.create'), validate(taskSchema), createTaskHandler);

export default router;
