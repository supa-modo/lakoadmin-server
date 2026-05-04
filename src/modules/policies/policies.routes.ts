import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import {
  createPolicySchema,
  updatePolicySchema,
  suspendPolicySchema,
  cancelPolicySchema,
  createMemberSchema,
  updateMemberSchema,
  createEndorsementSchema,
  rejectEndorsementSchema,
  generateDocumentSchema,
  createRenewalSchema,
} from './policies.validation';
import {
  getPolicies,
  getPoliciesStats,
  getPolicy,
  getPolicyActivationReadinessHandler,
  createPolicyHandler,
  updatePolicyHandler,
  deletePolicyHandler,
  activatePolicyHandler,
  suspendPolicyHandler,
  reinstatePolicyHandler,
  cancelPolicyHandler,
  getMembersHandler,
  addMemberHandler,
  updateMemberHandler,
  removeMemberHandler,
  getEndorsementsHandler,
  createEndorsementHandler,
  approveEndorsementHandler,
  rejectEndorsementHandler,
  getDocumentsHandler,
  uploadDocumentHandler,
  generateDocumentHandler,
  deleteDocumentHandler,
  getEventsHandler,
  createRenewalHandler,
  getRenewalsDueHandler,
} from './policies.controller';
import { policyClaimsHandler } from '../claims/claims.controller';
import { entityCommunicationsHandler } from '../communications/communications.controller';
import {
  calculatePolicyCommissionHandler,
  policyAccountingSummaryHandler,
  policyCommissionSummaryHandler,
  policyFinancialSummaryHandler,
  policyTimelineHandler,
  recordPolicyDirectInsurerPaymentHandler,
  recordPolicyPaymentHandler,
} from '../workflows/workflows.controller';

const router = Router();

router.use(authenticateToken);

// ─── Policies CRUD ────────────────────────────────────────
router.get('/stats', requirePermission('policies.read'), getPoliciesStats);
router.get('/renewals/due', requirePermission('policies.read'), getRenewalsDueHandler);
router.get('/', requirePermission('policies.read'), getPolicies);
router.post('/', requirePermission('policies.create'), validate(createPolicySchema), createPolicyHandler);
router.get('/:id', requirePermission('policies.read'), getPolicy);
router.get('/:id/communications', requirePermission('communications.read'), entityCommunicationsHandler);
router.get('/:id/claims', requirePermission('claims.read'), policyClaimsHandler);
router.get('/:id/activation-readiness', requirePermission('policies.read'), getPolicyActivationReadinessHandler);
router.get('/:id/financial-summary', requirePermission('policies.read'), policyFinancialSummaryHandler);
router.get('/:id/timeline', requirePermission('policies.read'), policyTimelineHandler);
router.get('/:id/commission-summary', requirePermission('commissions.read'), policyCommissionSummaryHandler);
router.get('/:id/accounting-summary', requirePermission('accounting.read'), policyAccountingSummaryHandler);
router.patch('/:id', requirePermission('policies.update'), validate(updatePolicySchema), updatePolicyHandler);
router.delete('/:id', requirePermission('policies.delete'), deletePolicyHandler);

// ─── Status Transitions ───────────────────────────────────
router.post('/:id/activate', requirePermission('policies.activate'), activatePolicyHandler);
router.post('/:id/record-payment', requirePermission('payments.create'), recordPolicyPaymentHandler);
router.post('/:id/record-direct-insurer-payment', requirePermission('payments.record_direct_insurer_payment'), recordPolicyDirectInsurerPaymentHandler);
router.post('/:id/calculate-commission', requirePermission('commissions.calculate'), calculatePolicyCommissionHandler);
router.post('/:id/suspend', requirePermission('policies.update'), validate(suspendPolicySchema), suspendPolicyHandler);
router.post('/:id/reinstate', requirePermission('policies.update'), reinstatePolicyHandler);
router.post('/:id/cancel', requirePermission('policies.update'), validate(cancelPolicySchema), cancelPolicyHandler);

// ─── Members ──────────────────────────────────────────────
router.get('/:id/members', requirePermission('policies.read'), getMembersHandler);
router.post('/:id/members', requirePermission('policies.update'), validate(createMemberSchema), addMemberHandler);
router.patch('/:id/members/:memberId', requirePermission('policies.update'), validate(updateMemberSchema), updateMemberHandler);
router.delete('/:id/members/:memberId', requirePermission('policies.update'), removeMemberHandler);

// ─── Endorsements ─────────────────────────────────────────
router.get('/:id/endorsements', requirePermission('policies.read'), getEndorsementsHandler);
router.post('/:id/endorsements', requirePermission('policies.update'), validate(createEndorsementSchema), createEndorsementHandler);
router.post('/:id/endorsements/:endorsementId/approve', requirePermission('policies.update'), approveEndorsementHandler);
router.post('/:id/endorsements/:endorsementId/reject', requirePermission('policies.update'), validate(rejectEndorsementSchema), rejectEndorsementHandler);

// ─── Documents ────────────────────────────────────────────
router.get('/:id/documents', requirePermission('policies.read'), getDocumentsHandler);
router.post('/:id/documents', requirePermission('policies.update'), uploadDocumentHandler);
router.post('/:id/documents/generate', requirePermission('policies.update'), validate(generateDocumentSchema), generateDocumentHandler);
router.delete('/:id/documents/:documentId', requirePermission('policies.update'), deleteDocumentHandler);

// ─── Events / History ─────────────────────────────────────
router.get('/:id/events', requirePermission('policies.read'), getEventsHandler);

// ─── Renewals ─────────────────────────────────────────────
router.post('/:id/renew', requirePermission('policies.create'), validate(createRenewalSchema), createRenewalHandler);

export default router;
