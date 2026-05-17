import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as controller from './commissionQuotes.controller';
import * as validation from './commissionQuotes.validation';

const router = Router();

// Commission Quote operations
router.post(
  '/quotes',
  authenticateToken,
  requirePermission('commissions.quotes.create'),
  validate(validation.createCommissionQuoteSchema),
  controller.createCommissionQuoteHandler
);

router.get(
  '/quotes',
  authenticateToken,
  requirePermission('commissions.quotes.read'),
  controller.listCommissionQuotesHandler
);

router.get(
  '/quotes/:id',
  authenticateToken,
  requirePermission('commissions.quotes.read'),
  controller.getCommissionQuoteHandler
);

router.patch(
  '/quotes/:id',
  authenticateToken,
  requirePermission('commissions.quotes.update'),
  validate(validation.updateCommissionQuoteSchema),
  controller.updateCommissionQuoteHandler
);

router.post(
  '/quotes/:id/reconcile',
  authenticateToken,
  requirePermission('commissions.quotes.reconcile'),
  validate(validation.reconcileCommissionQuoteSchema),
  controller.reconcileCommissionQuoteHandler
);

// Commission Invoice operations
router.post(
  '/invoices',
  authenticateToken,
  requirePermission('commissions.invoices.create'),
  validate(validation.createCommissionInvoiceSchema),
  controller.createCommissionInvoiceHandler
);

// Commission Payment operations
router.post(
  '/payments',
  authenticateToken,
  requirePermission('commissions.payments.record'),
  validate(validation.recordCommissionPaymentSchema),
  controller.recordCommissionPaymentHandler
);

// Insurer Statement operations
router.post(
  '/statements',
  authenticateToken,
  requirePermission('commissions.statements.upload'),
  validate(validation.uploadInsurerStatementSchema),
  controller.uploadInsurerStatementHandler
);

router.get(
  '/statements',
  authenticateToken,
  requirePermission('commissions.statements.upload'),
  controller.listInsurerStatementsHandler
);

router.post(
  '/statements/match',
  authenticateToken,
  requirePermission('commissions.statements.upload'),
  validate(validation.matchStatementLineSchema),
  controller.matchStatementLineHandler
);

export default router;
