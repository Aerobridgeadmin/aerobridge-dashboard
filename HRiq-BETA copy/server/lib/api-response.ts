import { Response } from 'express';

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: ResponseMeta;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: ResponseMeta;
}

export interface ResponseMeta {
  requestId?: string;
  timestamp: string;
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  processingTimeMs?: number;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

export function success<T>(
  res: Response,
  data: T,
  statusCode: number = 200,
  meta?: Partial<ResponseMeta>
): Response {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: (res.req as any)?.requestId,
      ...meta
    }
  };
  return res.status(statusCode).json(response);
}

export function created<T>(res: Response, data: T, meta?: Partial<ResponseMeta>): Response {
  return success(res, data, 201, meta);
}

export function paginated<T>(
  res: Response,
  data: T[],
  pagination: {
    page: number;
    limit: number;
    total: number;
  },
  meta?: Partial<ResponseMeta>
): Response {
  const totalPages = Math.ceil(pagination.total / pagination.limit);
  return success(res, data, 200, {
    page: pagination.page,
    limit: pagination.limit,
    total: pagination.total,
    totalPages,
    ...meta
  });
}

export function error(
  res: Response,
  code: string,
  message: string,
  statusCode: number = 500,
  details?: Record<string, unknown>
): Response {
  const response: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      details
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: (res.req as any)?.requestId
    }
  };
  return res.status(statusCode).json(response);
}

export function noContent(res: Response): Response {
  return res.status(204).send();
}

export const ApiResponseHelper = {
  success,
  created,
  paginated,
  error,
  noContent
};
