import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../lib/errors';

type ValidationType = 'body' | 'query' | 'params';

interface ValidatedRequest<TBody = unknown, TQuery = unknown, TParams = unknown> extends Request {
  validated: {
    body?: TBody;
    query?: TQuery;
    params?: TParams;
  };
}

export function validate<TBody = unknown, TQuery = unknown, TParams = unknown>(options: {
  body?: ZodSchema<TBody>;
  query?: ZodSchema<TQuery>;
  params?: ZodSchema<TParams>;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const validatedReq = req as ValidatedRequest<TBody, TQuery, TParams>;
    validatedReq.validated = {};
    
    const errors: Array<{ type: ValidationType; issues: ZodError['issues'] }> = [];
    
    if (options.body) {
      const result = options.body.safeParse(req.body);
      if (result.success) {
        validatedReq.validated.body = result.data;
      } else {
        errors.push({ type: 'body', issues: result.error.issues });
      }
    }
    
    if (options.query) {
      const result = options.query.safeParse(req.query);
      if (result.success) {
        validatedReq.validated.query = result.data;
      } else {
        errors.push({ type: 'query', issues: result.error.issues });
      }
    }
    
    if (options.params) {
      const result = options.params.safeParse(req.params);
      if (result.success) {
        validatedReq.validated.params = result.data;
      } else {
        errors.push({ type: 'params', issues: result.error.issues });
      }
    }
    
    if (errors.length > 0) {
      const messages = errors.flatMap(e => 
        e.issues.map(issue => {
          const path = issue.path.join('.');
          const location = e.type;
          return `${location}${path ? `.${path}` : ''}: ${issue.message}`;
        })
      );
      
      throw new ValidationError(messages.join('; '), {
        validationErrors: errors.flatMap(e => e.issues.map(i => ({
          location: e.type,
          path: i.path.join('.'),
          message: i.message
        })))
      });
    }
    
    next();
  };
}

export function validateBody<T>(schema: ZodSchema<T>) {
  return validate({ body: schema });
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return validate({ query: schema });
}

export function validateParams<T>(schema: ZodSchema<T>) {
  return validate({ params: schema });
}
