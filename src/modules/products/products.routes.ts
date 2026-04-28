import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import {
  createProductSchema,
  updateProductSchema,
  createVersionSchema,
  updateVersionSchema,
} from './products.validation';
import {
  getProducts,
  getProduct,
  searchProductsHandler,
  createProductHandler,
  updateProductHandler,
  deleteProductHandler,
  addVersionHandler,
  updateVersionHandler,
} from './products.controller';

const router = Router();

router.use(authenticateToken);

router.get('/search', requirePermission('products.read'), searchProductsHandler);
router.get('/', requirePermission('products.read'), getProducts);
router.post('/', requirePermission('products.create'), validate(createProductSchema), createProductHandler);
router.get('/:id', requirePermission('products.read'), getProduct);
router.patch('/:id', requirePermission('products.update'), validate(updateProductSchema), updateProductHandler);
router.delete('/:id', requirePermission('products.delete'), deleteProductHandler);

router.post('/:id/versions', requirePermission('products.update'), validate(createVersionSchema), addVersionHandler);
router.patch('/:id/versions/:versionId', requirePermission('products.update'), validate(updateVersionSchema), updateVersionHandler);

export default router;
