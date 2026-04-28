import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import {
  createInsurerSchema,
  updateInsurerSchema,
  createContactSchema,
  updateContactSchema,
} from './insurers.validation';
import {
  getInsurers,
  getInsurer,
  createInsurerHandler,
  updateInsurerHandler,
  deleteInsurerHandler,
  getContacts,
  addContactHandler,
  updateContactHandler,
  deleteContactHandler,
  getInsurerProductsHandler,
  getInsurerCommissionRulesHandler,
} from './insurers.controller';

const router = Router();

router.use(authenticateToken);

router.get('/', requirePermission('products.read'), getInsurers);
router.post('/', requirePermission('products.create'), validate(createInsurerSchema), createInsurerHandler);
router.get('/:id', requirePermission('products.read'), getInsurer);
router.patch('/:id', requirePermission('products.update'), validate(updateInsurerSchema), updateInsurerHandler);
router.delete('/:id', requirePermission('products.delete'), deleteInsurerHandler);

router.get('/:id/contacts', requirePermission('products.read'), getContacts);
router.post('/:id/contacts', requirePermission('products.update'), validate(createContactSchema), addContactHandler);
router.patch('/:id/contacts/:contactId', requirePermission('products.update'), validate(updateContactSchema), updateContactHandler);
router.delete('/:id/contacts/:contactId', requirePermission('products.update'), deleteContactHandler);

router.get('/:id/products', requirePermission('products.read'), getInsurerProductsHandler);
router.get('/:id/commission-rules', requirePermission('products.read'), getInsurerCommissionRulesHandler);

export default router;
