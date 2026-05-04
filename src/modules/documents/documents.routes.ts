import { Router } from 'express';
import multer from 'multer';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import {
  archiveDocumentHandler,
  createRequirementHandler,
  downloadDocumentHandler,
  entityDocumentsHandler,
  getDocumentHandler,
  listDocumentsHandler,
  listRequirementsHandler,
  rejectDocumentHandler,
  updateDocumentHandler,
  updateRequirementHandler,
  uploadDocumentHandler,
  verifyDocumentHandler,
} from './documents.controller';
import { listDocumentsQuerySchema, listRequirementsQuerySchema, updateDocumentSchema } from './documents.validation';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

router.use(authenticateToken);

router.get('/', requirePermission('documents.read'), validate(listDocumentsQuerySchema, 'query'), listDocumentsHandler);
router.post('/upload', requirePermission('documents.create'), upload.single('file'), uploadDocumentHandler);
router.get('/entity/:entityType/:entityId', requirePermission('documents.read'), entityDocumentsHandler);
router.get('/requirements', requirePermission('documents.read'), validate(listRequirementsQuerySchema, 'query'), listRequirementsHandler);
router.post('/requirements', requirePermission('documents.requirements.manage'), createRequirementHandler);
router.patch('/requirements/:id', requirePermission('documents.requirements.manage'), updateRequirementHandler);
router.get('/:id/download', requirePermission('documents.read'), downloadDocumentHandler);
router.get('/:id', requirePermission('documents.read'), getDocumentHandler);
router.patch('/:id', requirePermission('documents.update'), validate(updateDocumentSchema), updateDocumentHandler);
router.post('/:id/verify', requirePermission('documents.verify'), verifyDocumentHandler);
router.post('/:id/reject', requirePermission('documents.verify'), rejectDocumentHandler);
router.post('/:id/archive', requirePermission('documents.delete'), archiveDocumentHandler);
router.delete('/:id', requirePermission('documents.delete'), archiveDocumentHandler);

export default router;
