import { Request } from 'express';

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export function getPaginationParams(req: Request): PaginationParams {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export interface SortParams {
  orderBy: Record<string, 'asc' | 'desc'>;
}

export function getSortParams(
  req: Request,
  allowedFields: string[],
  defaultField = 'createdAt',
  defaultDir: 'asc' | 'desc' = 'desc',
): SortParams {
  const sortBy = req.query.sortBy as string;
  const sortDir = (req.query.sortDir as string) === 'asc' ? 'asc' : 'desc';

  const field = sortBy && allowedFields.includes(sortBy) ? sortBy : defaultField;
  const dir: 'asc' | 'desc' = sortBy && allowedFields.includes(sortBy) ? sortDir : defaultDir;

  return { orderBy: { [field]: dir } };
}
