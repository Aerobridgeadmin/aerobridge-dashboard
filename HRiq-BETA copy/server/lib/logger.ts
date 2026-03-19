import crypto from "crypto";

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  requestId?: string;
  userId?: string;
  resumeId?: string;
  jobId?: string;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    message: string;
    stack?: string;
  };
}

class Logger {
  private context: LogContext = {};

  generateRequestId(): string {
    return crypto.randomBytes(8).toString("hex");
  }

  withContext(context: LogContext): Logger {
    const child = new Logger();
    child.context = { ...this.context, ...context };
    return child;
  }

  private formatEntry(level: LogLevel, message: string, context?: LogContext, error?: Error): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { ...this.context, ...context },
    };

    if (error) {
      entry.error = {
        message: error.message,
        stack: error.stack,
      };
    }

    return entry;
  }

  private log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    const entry = this.formatEntry(level, message, context, error);
    const prefix = `[${entry.timestamp}] [${level.toUpperCase()}]`;
    const contextStr = entry.context && Object.keys(entry.context).length > 0 
      ? ` ${JSON.stringify(entry.context)}` 
      : "";
    
    const logMessage = `${prefix} ${message}${contextStr}`;

    switch (level) {
      case "debug":
        console.debug(logMessage);
        break;
      case "info":
        console.log(logMessage);
        break;
      case "warn":
        console.warn(logMessage);
        if (error) console.warn(error.stack);
        break;
      case "error":
        console.error(logMessage);
        if (error) console.error(error.stack);
        break;
    }
  }

  debug(message: string, ...args: unknown[]): void {
    const { context, formattedMessage } = this.parseArgs(message, args);
    this.log("debug", formattedMessage, context);
  }

  info(message: string, ...args: unknown[]): void {
    const { context, formattedMessage } = this.parseArgs(message, args);
    this.log("info", formattedMessage, context);
  }

  warn(message: string, ...args: unknown[]): void {
    const { context, formattedMessage, error } = this.parseArgs(message, args);
    this.log("warn", formattedMessage, context, error);
  }

  error(message: string, ...args: unknown[]): void {
    const { context, formattedMessage, error } = this.parseArgs(message, args);
    this.log("error", formattedMessage, context, error);
  }

  private parseArgs(message: string, args: unknown[]): { context?: LogContext; formattedMessage: string; error?: Error } {
    let context: LogContext | undefined;
    let error: Error | undefined;
    const extraParts: string[] = [];

    for (const arg of args) {
      if (arg instanceof Error) {
        error = arg;
        extraParts.push(arg.message);
      } else if (arg && typeof arg === 'object' && !Array.isArray(arg) && this.isLogContext(arg)) {
        context = arg as LogContext;
      } else if (arg !== undefined && arg !== null) {
        extraParts.push(String(arg));
      }
    }

    const formattedMessage = extraParts.length > 0 
      ? `${message} ${extraParts.join(' ')}`
      : message;

    return { context, formattedMessage, error };
  }

  private isLogContext(obj: unknown): obj is LogContext {
    if (typeof obj !== 'object' || obj === null) return false;
    const keys = Object.keys(obj);
    if (keys.length === 0) return true;
    const contextKeys = ['requestId', 'userId', 'resumeId', 'jobId'];
    return keys.some(k => contextKeys.includes(k)) || 
           keys.every(k => typeof (obj as Record<string, unknown>)[k] !== 'function');
  }
}

export const logger = new Logger();
