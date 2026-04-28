import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import {
  createOnboardingSchema,
  updateOnboardingSchema,
  listOnboardingSchema,
  uploadDocumentSchema,
  verifyDocumentSchema,
  submitOnboardingSchema,
  approveOnboardingSchema,
  rejectOnboardingSchema,
  createPolicyFromOnboardingSchema,
} from './onboarding.validation';
import {
  getOnboardingCases,
  getOnboardingCase,
  createOnboardingHandler,
  updateOnboardingHandler,
  uploadDocumentHandler,
  verifyDocumentHandler,
  submitOnboardingHandler,
  approveOnboardingHandler,
  rejectOnboardingHandler,
  createPolicyFromOnboardingHandler,
} from './onboarding.controller';

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req: any, file: any, cb: any) => {
    cb(null, 'uploads/onboarding/');
  },
  filename: (req: any, file: any, cb: any) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for group member archives
  },
  fileFilter: (req: any, file: any, cb: any) => {
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx|zip|rar|7z/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const archiveMimeTypes = [
      'application/zip',
      'application/x-zip-compressed',
      'application/x-rar-compressed',
      'application/vnd.rar',
      'application/x-7z-compressed',
      'application/octet-stream',
    ];
    const mimetype = allowedTypes.test(file.mimetype) || archiveMimeTypes.includes(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image, document, and compressed archive files are allowed'));
    }
  },
});

router.use(authenticateToken);

router.get('/', requirePermission('onboarding.read'), validate(listOnboardingSchema, 'query'), getOnboardingCases);
router.post('/', requirePermission('onboarding.create'), validate(createOnboardingSchema), createOnboardingHandler);
router.get('/:id', requirePermission('onboarding.read'), getOnboardingCase);
router.patch('/:id', requirePermission('onboarding.update'), validate(updateOnboardingSchema), updateOnboardingHandler);
router.post('/:id/documents', requirePermission('onboarding.update'), upload.single('file'), uploadDocumentHandler);
router.patch('/:id/documents/:docId', requirePermission('onboarding.update'), validate(verifyDocumentSchema), verifyDocumentHandler);
router.post('/:id/submit', requirePermission('onboarding.update'), validate(submitOnboardingSchema), submitOnboardingHandler);
router.post('/:id/approve', requirePermission('onboarding.approve'), validate(approveOnboardingSchema), approveOnboardingHandler);
router.post('/:id/reject', requirePermission('onboarding.reject'), validate(rejectOnboardingSchema), rejectOnboardingHandler);
router.post('/:id/create-policy', requirePermission('policies.create'), validate(createPolicyFromOnboardingSchema), createPolicyFromOnboardingHandler);

export default router;
