import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../types/express';
import { sendSuccess, sendCreated, sendError, buildPaginationMeta, sendPaginated } from '../../utils/apiResponse';
import { logAudit } from '../../services/auditService';
import {
  listProducts,
  getProductById,
  searchProducts,
  createProduct,
  updateProduct,
  softDeleteProduct,
  addVersion,
  updateVersion,
} from './products.service';

export async function getProducts(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { products, total, page, limit } = await listProducts(req);
    const pagination = buildPaginationMeta(total, page, limit);
    sendPaginated(res, products, pagination);
  } catch (err) {
    next(err);
  }
}

export async function getProduct(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const product = await getProductById(req.params.id);
    sendSuccess(res, product);
  } catch (err) {
    if ((err as Error).message === 'Product not found') {
      sendError(res, 'Product not found', 404);
    } else {
      next(err);
    }
  }
}

export async function searchProductsHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = (req.query.q as string) || '';
    const insurerId = req.query.insurerId as string | undefined;
    const products = await searchProducts(query, insurerId);
    sendSuccess(res, products);
  } catch (err) {
    next(err);
  }
}

export async function createProductHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const product = await createProduct(req.body, req.user?.id);
    logAudit(req, 'CREATE', 'Product', product.id, null, { id: product.id, name: product.name });
    sendCreated(res, product, 'Product created successfully');
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('already exists') || msg === 'Insurer not found') {
      sendError(res, msg, 409);
    } else {
      next(err);
    }
  }
}

export async function updateProductHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const before = await getProductById(req.params.id).catch(() => null);
    const product = await updateProduct(req.params.id, req.body);
    logAudit(req, 'UPDATE', 'Product', product.id, before, product);
    sendSuccess(res, product, 'Product updated successfully');
  } catch (err) {
    if ((err as Error).message === 'Product not found') {
      sendError(res, 'Product not found', 404);
    } else {
      next(err);
    }
  }
}

export async function deleteProductHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await softDeleteProduct(req.params.id);
    logAudit(req, 'DELETE', 'Product', req.params.id, null, null);
    sendSuccess(res, null, 'Product deleted successfully');
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'Product not found') {
      sendError(res, msg, 404);
    } else if (msg.includes('active policies')) {
      sendError(res, msg, 409);
    } else {
      next(err);
    }
  }
}

export async function addVersionHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const version = await addVersion(req.params.id, req.body);
    logAudit(req, 'CREATE', 'ProductVersion', version.id, null, version);
    sendCreated(res, version, 'Version added successfully');
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'Product not found') {
      sendError(res, msg, 404);
    } else if (msg.includes('already exists')) {
      sendError(res, msg, 409);
    } else {
      next(err);
    }
  }
}

export async function updateVersionHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const version = await updateVersion(req.params.id, req.params.versionId, req.body);
    logAudit(req, 'UPDATE', 'ProductVersion', version.id, null, version);
    sendSuccess(res, version, 'Version updated successfully');
  } catch (err) {
    if ((err as Error).message === 'Version not found') {
      sendError(res, 'Version not found', 404);
    } else {
      next(err);
    }
  }
}
