import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { 
  AppError, 
  ValidationError, 
  isAppError, 
  wrapError 
} from '../lib/errors';
import { ApiResponseHelper } from '../lib/api-response';
import { logger } from '../lib/logger';
import { logApiError } from '../lib/error-logger';
import { getRequestDuration } from './request-context';

function formatZodError(error: ZodError): string {
  const issues = error.issues.map(issue => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  return issues.join('; ');
}

export const errorHandler: ErrorRequestHandler = async (
  err: Error | AppError | ZodError,
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  const duration = getRequestDuration(req);
  const requestId = req.requestId || 'unknown';
  
  let appError: AppError;
  
  if (err instanceof ZodError) {
    appError = new ValidationError(formatZodError(err), {
      validationErrors: err.issues
    });
  } else if (isAppError(err)) {
    appError = err;
  } else {
    appError = wrapError(err);
  }
  
  const logContext = {
    requestId,
    method: req.method,
    path: req.path,
    statusCode: appError.statusCode,
    duration,
    userId: req.context?.userId,
    errorCode: appError.code
  };
  
  if (appError.statusCode >= 500 || !appError.isOperational) {
    logger.error(`[${requestId}] ${req.method} ${req.path} failed: ${appError.message}`, logContext);
    
    await logApiError(appError.message, appError, {
      endpoint: `${req.method} ${req.path}`,
      requestId,
      userId: req.context?.userId,
      statusCode: appError.statusCode,
      errorCode: appError.code
    }).catch(() => {});
  } else {
    logger.warn(`[${requestId}] ${req.method} ${req.path} client error: ${appError.message}`, logContext);
  }
  
  ApiResponseHelper.error(
    res,
    appError.code,
    appError.isOperational ? appError.message : 'An unexpected error occurred',
    appError.statusCode,
    appError.isOperational ? appError.details : undefined
  );
};

export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function notFoundHandler(req: Request, res: Response): void {
  ApiResponseHelper.error(
    res,
    'NOT_FOUND',
    `Route ${req.method} ${req.path} not found`,
    404
  );
}
