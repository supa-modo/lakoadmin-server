import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { sendError } from '../utils/apiResponse';

export function validate(schema: ZodSchema, target: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      const messages = (result.error as ZodError).errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      sendError(res, messages, 422, 'VALIDATION_ERROR');
      return;
    }

    req[target] = result.data;
    next();
  };
}
