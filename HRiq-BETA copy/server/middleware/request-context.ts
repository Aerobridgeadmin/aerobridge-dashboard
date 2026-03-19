import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export interface RequestContext {
  requestId: string;
  startTime: number;
  userId?: string;
  userEmail?: string;
  userRole?: string;
}

declare global {
  namespace Express {
    interface Request {
      context: RequestContext;
      requestId: string;
    }
  }
}

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.headers['x-request-id'] as string || crypto.randomBytes(8).toString('hex');
  
  const context: RequestContext = {
    requestId,
    startTime: Date.now(),
    userId: req.session?.userId,
    userEmail: req.session?.userEmail,
    userRole: req.session?.userRole
  };
  
  req.context = context;
  req.requestId = requestId;
  
  res.setHeader('X-Request-ID', requestId);
  
  next();
}

export function getRequestDuration(req: Request): number {
  return Date.now() - (req.context?.startTime || Date.now());
}
