export type ErrorCode = 
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTEGRATION_ERROR'
  | 'DATABASE_ERROR'
  | 'PARSING_ERROR'
  | 'AI_ERROR'
  | 'INTERNAL_ERROR';

export interface ErrorDetails {
  field?: string;
  constraint?: string;
  integration?: string;
  retryable?: boolean;
  retryAfterMs?: number;
  [key: string]: unknown;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: ErrorDetails;
  public readonly timestamp: Date;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    details?: ErrorDetails
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;
    this.timestamp = new Date();
    
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp.toISOString()
    };
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super('VALIDATION_ERROR', message, 400, true, details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    const message = identifier 
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super('NOT_FOUND', message, 404, true, { resource, identifier });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required') {
    super('UNAUTHORIZED', message, 401, true);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Access denied') {
    super('FORBIDDEN', message, 403, true);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super('CONFLICT', message, 409, true, details);
  }
}

export class RateLimitedError extends AppError {
  constructor(retryAfterMs?: number, integration?: string) {
    super(
      'RATE_LIMITED',
      'Too many requests. Please try again later.',
      429,
      true,
      { retryable: true, retryAfterMs, integration }
    );
  }
}

export class IntegrationError extends AppError {
  constructor(
    integration: string,
    message: string,
    retryable: boolean = false,
    details?: ErrorDetails
  ) {
    super(
      'INTEGRATION_ERROR',
      `${integration} error: ${message}`,
      502,
      true,
      { integration, retryable, ...details }
    );
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super('DATABASE_ERROR', message, 500, true, details);
  }
}

export class ParsingError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super('PARSING_ERROR', message, 422, true, details);
  }
}

export class AIError extends AppError {
  constructor(message: string, retryable: boolean = true, details?: ErrorDetails) {
    super('AI_ERROR', message, 502, true, { retryable, ...details });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function isRetryableError(error: unknown): boolean {
  if (isAppError(error)) {
    return error.details?.retryable === true;
  }
  return false;
}

export function wrapError(error: unknown, defaultMessage: string = 'An unexpected error occurred'): AppError {
  if (isAppError(error)) {
    return error;
  }
  
  if (error instanceof Error) {
    return new AppError('INTERNAL_ERROR', error.message || defaultMessage, 500, false);
  }
  
  return new AppError('INTERNAL_ERROR', defaultMessage, 500, false);
}
