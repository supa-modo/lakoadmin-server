import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import {
  allocatePaymentSchema,
  createInvoiceSchema,
  failPaymentSchema,
  listPaymentsQuerySchema,
  recordPaymentSchema,
  reversePaymentSchema,
  verifyPaymentSchema,
} from './payments.validation';
import {
  allocatePaymentHandler,
  createInvoiceHandler,
  downloadReceipt,
  failPaymentHandler,
  getBankAccounts,
  getInvoices,
  getMpesaAccounts,
  getPayment,
  getPayments,
  getPaymentsStats,
  getPolicyBalanceHandler,
  recordPaymentHandler,
  reversePaymentHandler,
  verifyPaymentHandler,
} from './payments.controller';

const router = Router();

router.use(authenticateToken);

router.get('/stats', requirePermission('payments.read'), getPaymentsStats);
router.get('/bank-accounts', requirePermission('payments.read'), getBankAccounts);
router.get('/mpesa-accounts', requirePermission('payments.read'), getMpesaAccounts);
router.get('/invoices', requirePermission('payments.read'), getInvoices);
router.post('/invoices', requirePermission('payments.create'), validate(createInvoiceSchema), createInvoiceHandler);
router.get('/policies/:policyId/balance', requirePermission('payments.read'), getPolicyBalanceHandler);

router.get('/', requirePermission('payments.read'), validate(listPaymentsQuerySchema, 'query'), getPayments);
router.post('/', requirePermission('payments.create'), validate(recordPaymentSchema), recordPaymentHandler);

router.get('/:id', requirePermission('payments.read'), getPayment);
router.get('/:id/receipt/download', requirePermission('payments.read'), downloadReceipt);
router.post('/:id/allocate', requirePermission('payments.create'), validate(allocatePaymentSchema), allocatePaymentHandler);
router.post('/:id/verify', requirePermission('payments.verify'), validate(verifyPaymentSchema), verifyPaymentHandler);
router.post('/:id/fail', requirePermission('payments.verify'), validate(failPaymentSchema), failPaymentHandler);
router.post('/:id/reverse', requirePermission('payments.reverse'), validate(reversePaymentSchema), reversePaymentHandler);

export default router;
