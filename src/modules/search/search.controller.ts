import { NextFunction, Response } from 'express';
import { AuthRequest } from '../../types/express';
import { sendError, sendSuccess } from '../../utils/apiResponse';
import { universalSearch } from './search.service';

export async function universalSearchHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Unauthorized', 401);
      return;
    }

    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const result = await universalSearch(req.user, q, Number.isFinite(limit) ? limit : undefined);
    sendSuccess(res, result, 'Search results retrieved');
  } catch (error) {
    next(error);
  }
}
