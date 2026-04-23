import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import {
  createClientSchema,
  updateClientSchema,
  listClientsSchema,
  createContactSchema,
  updateContactSchema,
} from './clients.validation';
import {
  getClients,
  getClient,
  createClientHandler,
  updateClientHandler,
  deleteClientHandler,
  searchClientsHandler,
  getClientContacts,
  createContactHandler,
  updateContactHandler,
  deleteContactHandler,
} from './clients.controller';

const router = Router();

router.use(authenticateToken);

router.get('/', requirePermission('clients.read'), validate(listClientsSchema, 'query'), getClients);
router.post('/', requirePermission('clients.create'), validate(createClientSchema), createClientHandler);
router.get('/search', requirePermission('clients.read'), searchClientsHandler);
router.get('/:id', requirePermission('clients.read'), getClient);
router.patch('/:id', requirePermission('clients.update'), validate(updateClientSchema), updateClientHandler);
router.delete('/:id', requirePermission('clients.delete'), deleteClientHandler);

// Contact routes
router.get('/:id/contacts', requirePermission('clients.read'), getClientContacts);
router.post('/:id/contacts', requirePermission('clients.update'), validate(createContactSchema), createContactHandler);
router.patch('/:id/contacts/:contactId', requirePermission('clients.update'), validate(updateContactSchema), updateContactHandler);
router.delete('/:id/contacts/:contactId', requirePermission('clients.update'), deleteContactHandler);

export default router;
