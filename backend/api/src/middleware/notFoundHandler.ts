// =============================================================================
// MediCore API - Not Found Handler
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { errorResponse } from '../utils/apiResponse';

export function notFoundHandler(req: Request, res: Response, _next: NextFunction): void {
  errorResponse(
    res,
    `Route ${req.method} ${req.originalUrl} not found`,
    'NOT_FOUND',
    404
  );
}
