import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requireAnyPermission, requirePermission } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import {
  audiencePreviewSchema,
  automationUpdateSchema,
  bulkMessageSchema,
  campaignSchema,
  campaignUpdateSchema,
  listQuerySchema,
  preferenceUpdateSchema,
  previewTemplateSchema,
  recipientSearchSchema,
  sendMessageSchema,
  templateSchema,
  updateTemplateSchema,
} from './communications.validation';
import {
  audiencePreviewHandler,
  automationsIndex,
  automationsTest,
  automationsUpdate,
  campaignsCancel,
  campaignsCreate,
  campaignsIndex,
  campaignsSend,
  campaignsShow,
  campaignsUpdate,
  logsIndex,
  logsRetry,
  logsShow,
  preferencesShow,
  preferencesUpdate,
  recipientsSearchHandler,
  sendBulkHandler,
  sendMessageHandler,
  statsHandler,
  templatesCreate,
  templatesDelete,
  templatesIndex,
  templatesPreview,
  templatesShow,
  templatesUpdate,
} from './communications.controller';

const router = Router();

router.use(authenticateToken);

router.get('/stats', requirePermission('communications.read'), statsHandler);

router.get('/templates', requirePermission('communications.templates.read'), validate(listQuerySchema, 'query'), templatesIndex);
router.post('/templates', requirePermission('communications.templates.create'), validate(templateSchema), templatesCreate);
router.get('/templates/:id', requirePermission('communications.templates.read'), templatesShow);
router.patch('/templates/:id', requirePermission('communications.templates.update'), validate(updateTemplateSchema), templatesUpdate);
router.delete('/templates/:id', requirePermission('communications.templates.delete'), templatesDelete);
router.post('/templates/:id/preview', requirePermission('communications.templates.read'), validate(previewTemplateSchema), templatesPreview);

router.post('/send', requirePermission('communications.send'), validate(sendMessageSchema), sendMessageHandler);
router.post('/send-bulk', requirePermission('communications.send_bulk'), validate(bulkMessageSchema), sendBulkHandler);
router.post('/schedule', requirePermission('communications.schedule'), validate(sendMessageSchema), sendMessageHandler);

router.get('/logs', requirePermission('communications.logs.read'), validate(listQuerySchema, 'query'), logsIndex);
router.get('/logs/:id', requirePermission('communications.logs.read'), logsShow);
router.post('/logs/:id/retry', requirePermission('communications.send'), logsRetry);

router.get('/recipients/search', requireAnyPermission('communications.send', 'communications.send_bulk'), validate(recipientSearchSchema, 'query'), recipientsSearchHandler);
router.post('/audience/preview', requirePermission('communications.send_bulk'), validate(audiencePreviewSchema), audiencePreviewHandler);

router.get('/campaigns', requirePermission('communications.campaigns.read'), validate(listQuerySchema, 'query'), campaignsIndex);
router.post('/campaigns', requirePermission('communications.campaigns.create'), validate(campaignSchema), campaignsCreate);
router.get('/campaigns/:id', requirePermission('communications.campaigns.read'), campaignsShow);
router.patch('/campaigns/:id', requirePermission('communications.campaigns.create'), validate(campaignUpdateSchema), campaignsUpdate);
router.post('/campaigns/:id/send', requirePermission('communications.campaigns.send'), campaignsSend);
router.post('/campaigns/:id/cancel', requirePermission('communications.campaigns.send'), campaignsCancel);

router.get('/automations', requirePermission('communications.automations.manage'), automationsIndex);
router.patch('/automations/:id', requirePermission('communications.automations.manage'), validate(automationUpdateSchema), automationsUpdate);
router.post('/automations/:id/test', requirePermission('communications.automations.manage'), automationsTest);

router.get('/preferences/:clientId', requirePermission('communications.read'), preferencesShow);
router.patch('/preferences/:clientId', requirePermission('communications.settings.manage'), validate(preferenceUpdateSchema), preferencesUpdate);

export default router;
