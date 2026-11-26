// =============================================================================
// MediCore API - Standard API Response Helpers
// =============================================================================

import { Response } from 'express';

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  meta?: Record<string, any>;
  error?: {
    code: string;
    details: any[];
  };
  requestId?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export function successResponse<T>(
  res: Response,
  data: T,
  message: string = 'Operation completed successfully',
  statusCode: number = 200,
  meta?: Record<string, any>
): Response {
  const response: ApiResponse<T> = {
    success: true,
    message,
    data,
    meta,
    requestId: (res.req as any).requestId,
  };
  return res.status(statusCode).json(response);
}

export function createdResponse<T>(
  res: Response,
  data: T,
  message: string = 'Resource created successfully'
): Response {
  return successResponse(res, data, message, 201);
}

export function paginatedResponse<T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number,
  message: string = 'Data retrieved successfully'
): Response {
  const totalPages = Math.ceil(total / limit);
  const meta: PaginationMeta = {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
  return successResponse(res, data, message, 200, meta);
}

export function errorResponse(
  res: Response,
  message: string,
  code: string,
  statusCode: number = 400,
  details: any[] = []
): Response {
  const response: ApiResponse = {
    success: false,
    message,
    error: { code, details },
    requestId: (res.req as any).requestId,
  };
  return res.status(statusCode).json(response);
}
