import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, ForbiddenError } from '../lib/errors';
import { logger } from '../lib/logger';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    isActive: boolean;
  };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    logger.warn(`[Auth] Unauthorized access attempt to ${req.method} ${req.path}`, {
      requestId: req.requestId,
      ip: req.ip
    });
    throw new UnauthorizedError('Authentication required. Please log in.');
  }
  
  req.context.userId = req.session.userId;
  req.context.userEmail = req.session.userEmail;
  req.context.userRole = req.session.userRole;
  
  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.session?.userRole !== 'admin') {
      logger.warn(`[Auth] Admin access denied for user ${req.session?.userEmail}`, {
        requestId: req.requestId,
        userId: req.session?.userId,
        path: req.path
      });
      throw new ForbiddenError('Admin access required');
    }
    next();
  });
}

export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    requireAuth(req, res, () => {
      const userRole = req.session?.userRole;
      if (!userRole || !roles.includes(userRole)) {
        logger.warn(`[Auth] Role access denied for user ${req.session?.userEmail}`, {
          requestId: req.requestId,
          requiredRoles: roles,
          userRole
        });
        throw new ForbiddenError(`Required role: ${roles.join(' or ')}`);
      }
      next();
    });
  };
}

export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (req.session?.userId) {
    req.context.userId = req.session.userId;
    req.context.userEmail = req.session.userEmail;
    req.context.userRole = req.session.userRole;
  }
  next();
}
