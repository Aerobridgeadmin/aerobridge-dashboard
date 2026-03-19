import { Request, Response, NextFunction, RequestHandler, Express, Router } from 'express';
import { asyncHandler } from './error-handler';
import { structuredLogger } from '../lib/structured-logger';

export function wrapAsyncRoute(handler: RequestHandler): RequestHandler {
  return asyncHandler(handler);
}

export function wrapRouter(router: Express | Router): void {
  const stack = (router as any)._router?.stack || (router as any).stack;
  if (!stack) return;

  for (const layer of stack) {
    if (layer.route) {
      for (const routeLayer of layer.route.stack) {
        const originalHandler = routeLayer.handle;
        if (originalHandler.length <= 3 && typeof originalHandler === 'function') {
          routeLayer.handle = asyncHandler(originalHandler);
        }
      }
    } else if (layer.handle && layer.name !== 'router') {
      continue;
    }
  }
}

export function createLoggingWrapper(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const requestId = req.requestId || 'unknown';
    const method = req.method;
    const path = req.path;
    
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const statusCode = res.statusCode;
      
      if (path.startsWith('/api')) {
        structuredLogger.logRequest(method, path, statusCode, duration, { requestId });
      }
    });
    
    next();
  };
}

export function applyAsyncHandlerToLegacyRoutes(app: Express): void {
  const router = (app as any)._router;
  if (!router) return;

  for (const layer of router.stack) {
    if (!layer.route) continue;
    
    const route = layer.route;
    for (const routeLayer of route.stack) {
      const handler = routeLayer.handle;
      
      if (handler.constructor.name === 'AsyncFunction' || 
          (typeof handler === 'function' && handler.length <= 3)) {
        
        const isAlreadyWrapped = handler.name === 'asyncHandlerWrapper' || 
                                  handler._isAsyncHandlerWrapped;
        
        if (!isAlreadyWrapped) {
          const wrappedHandler = asyncHandler(handler);
          (wrappedHandler as any)._isAsyncHandlerWrapped = true;
          routeLayer.handle = wrappedHandler;
        }
      }
    }
  }
  
  structuredLogger.info('Applied asyncHandler to legacy routes');
}
