import crypto from 'crypto';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  userId?: string;
  resumeId?: string;
  jobId?: string;
  integration?: string;
  operation?: string;
  duration?: number;
  [key: string]: unknown;
}

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

class StructuredLogger {
  private context: LogContext = {};
  private minLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

  generateRequestId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  child(context: LogContext): StructuredLogger {
    const childLogger = new StructuredLogger();
    childLogger.context = { ...this.context, ...context };
    childLogger.minLevel = this.minLevel;
    return childLogger;
  }

  withContext(context: LogContext): StructuredLogger {
    return this.child(context);
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel];
  }

  private formatEntry(level: LogLevel, message: string, context?: LogContext, error?: Error): StructuredLogEntry {
    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { ...this.context, ...context }
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code
      };
    }

    return entry;
  }

  private output(entry: StructuredLogEntry): void {
    const jsonOutput = process.env.LOG_FORMAT === 'json';
    
    if (jsonOutput) {
      const output = JSON.stringify(entry);
      switch (entry.level) {
        case 'debug':
          console.debug(output);
          break;
        case 'info':
          console.log(output);
          break;
        case 'warn':
          console.warn(output);
          break;
        case 'error':
          console.error(output);
          break;
      }
    } else {
      const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`;
      const reqId = entry.context.requestId ? ` [${entry.context.requestId}]` : '';
      const contextStr = Object.keys(entry.context).length > 0 
        ? ` ${JSON.stringify(entry.context)}` 
        : '';
      
      const logMessage = `${prefix}${reqId} ${entry.message}${contextStr}`;

      switch (entry.level) {
        case 'debug':
          console.debug(logMessage);
          break;
        case 'info':
          console.log(logMessage);
          break;
        case 'warn':
          console.warn(logMessage);
          if (entry.error?.stack) console.warn(entry.error.stack);
          break;
        case 'error':
          console.error(logMessage);
          if (entry.error?.stack) console.error(entry.error.stack);
          break;
      }
    }
  }

  private log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    if (!this.shouldLog(level)) return;
    const entry = this.formatEntry(level, message, context, error);
    this.output(entry);
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, contextOrError?: LogContext | Error, error?: Error): void {
    if (contextOrError instanceof Error) {
      this.log('warn', message, undefined, contextOrError);
    } else {
      this.log('warn', message, contextOrError, error);
    }
  }

  error(message: string, contextOrError?: LogContext | Error, error?: Error): void {
    if (contextOrError instanceof Error) {
      this.log('error', message, undefined, contextOrError);
    } else {
      this.log('error', message, contextOrError, error);
    }
  }

  startTimer(operation: string, context?: LogContext): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.info(`${operation} completed`, { ...context, operation, duration });
    };
  }

  logRequest(method: string, path: string, statusCode: number, duration: number, context?: LogContext): void {
    const level: LogLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    this.log(level, `${method} ${path} ${statusCode} ${duration}ms`, {
      ...context,
      httpMethod: method,
      httpPath: path,
      httpStatus: statusCode,
      duration
    });
  }

  logIntegration(
    integration: string, 
    operation: string, 
    success: boolean, 
    duration: number, 
    context?: LogContext
  ): void {
    const level: LogLevel = success ? 'info' : 'warn';
    this.log(level, `[${integration}] ${operation} ${success ? 'succeeded' : 'failed'}`, {
      ...context,
      integration,
      operation,
      success,
      duration
    });
  }

  logJob(
    jobType: string,
    jobId: string,
    status: string,
    progress?: number,
    context?: LogContext
  ): void {
    this.info(`[Job:${jobType}] ${jobId} ${status}`, {
      ...context,
      jobType,
      jobId,
      jobStatus: status,
      progress
    });
  }
}

export const structuredLogger = new StructuredLogger();

export { StructuredLogger };
