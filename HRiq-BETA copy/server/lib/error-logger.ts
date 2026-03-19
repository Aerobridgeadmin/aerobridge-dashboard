import { db } from "../db";
import { errorLogs, type InsertErrorLog } from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { logger } from "./logger";
import crypto from "crypto";

export type ErrorCategory = "api" | "sync" | "parsing" | "ai" | "database" | "auth" | "webhook" | "system";
export type ErrorLevel = "error" | "warn" | "info";

interface ErrorLogContext {
  resumeId?: string;
  jobId?: string;
  sessionId?: string;
  candidateId?: string;
  endpoint?: string;
  userId?: string;
  requestId?: string;
  [key: string]: unknown;
}

interface LogErrorOptions {
  level?: ErrorLevel;
  category: ErrorCategory;
  message: string;
  error?: Error;
  context?: ErrorLogContext;
  endpoint?: string;
  userId?: string;
  requestId?: string;
}

export async function logError(options: LogErrorOptions): Promise<string | null> {
  const {
    level = "error",
    category,
    message,
    error,
    context,
    endpoint,
    userId,
    requestId
  } = options;

  try {
    const now = new Date();
    const normalizedMessage = message.substring(0, 200);

    const existing = await db.select()
      .from(errorLogs)
      .where(
        and(
          eq(errorLogs.category, category),
          sql`left(${errorLogs.message}, 200) = ${normalizedMessage}`,
          eq(errorLogs.resolved, false)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const existingLog = existing[0];
      await db.update(errorLogs)
        .set({
          occurrences: sql`${errorLogs.occurrences} + 1`,
          lastSeenAt: now,
          stack: error?.stack || existingLog.stack,
          context: context ? { ...((existingLog.context as object) || {}), ...context } : existingLog.context
        })
        .where(eq(errorLogs.id, existingLog.id));
      
      return existingLog.id;
    }

    const insertData: InsertErrorLog = {
      level,
      category,
      message,
      stack: error?.stack,
      context: context as Record<string, unknown>,
      endpoint,
      userId,
      requestId,
      resolved: false,
      occurrences: 1
    };

    const [inserted] = await db.insert(errorLogs).values(insertData).returning();
    return inserted?.id || null;

  } catch (dbError) {
    logger.error("[ErrorLogger] Failed to log error to database", dbError);
    return null;
  }
}

export async function logApiError(
  message: string,
  error?: Error,
  context?: ErrorLogContext
): Promise<string | null> {
  return logError({
    level: "error",
    category: "api",
    message,
    error,
    context,
    endpoint: context?.endpoint as string,
    requestId: context?.requestId as string
  });
}

export async function logSyncError(
  message: string,
  error?: Error,
  context?: ErrorLogContext
): Promise<string | null> {
  return logError({
    level: "error",
    category: "sync",
    message,
    error,
    context
  });
}

export async function logParsingError(
  message: string,
  error?: Error,
  context?: ErrorLogContext
): Promise<string | null> {
  return logError({
    level: "error",
    category: "parsing",
    message,
    error,
    context
  });
}

export async function logAiError(
  message: string,
  error?: Error,
  context?: ErrorLogContext
): Promise<string | null> {
  return logError({
    level: "error",
    category: "ai",
    message,
    error,
    context
  });
}

export async function logDatabaseError(
  message: string,
  error?: Error,
  context?: ErrorLogContext
): Promise<string | null> {
  return logError({
    level: "error",
    category: "database",
    message,
    error,
    context
  });
}

export async function logWebhookError(
  message: string,
  error?: Error,
  context?: ErrorLogContext
): Promise<string | null> {
  return logError({
    level: "error",
    category: "webhook",
    message,
    error,
    context
  });
}

export async function getErrorLogs(options: {
  category?: ErrorCategory;
  level?: ErrorLevel;
  resolved?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ logs: typeof errorLogs.$inferSelect[]; total: number }> {
  const { category, level, resolved, limit = 50, offset = 0 } = options;
  
  let conditions: any[] = [];
  
  if (category) {
    conditions.push(eq(errorLogs.category, category));
  }
  if (level) {
    conditions.push(eq(errorLogs.level, level));
  }
  if (resolved !== undefined) {
    conditions.push(eq(errorLogs.resolved, resolved));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [logs, countResult] = await Promise.all([
    db.select()
      .from(errorLogs)
      .where(whereClause)
      .orderBy(desc(errorLogs.lastSeenAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` })
      .from(errorLogs)
      .where(whereClause)
  ]);

  return {
    logs,
    total: countResult[0]?.count || 0
  };
}

export async function resolveError(
  id: string,
  resolvedBy?: string,
  notes?: string
): Promise<boolean> {
  const result = await db.update(errorLogs)
    .set({
      resolved: true,
      resolvedAt: new Date(),
      resolvedBy,
      notes
    })
    .where(eq(errorLogs.id, id))
    .returning();
  
  return result.length > 0;
}

export async function unresolveError(id: string): Promise<boolean> {
  const result = await db.update(errorLogs)
    .set({
      resolved: false,
      resolvedAt: null,
      resolvedBy: null
    })
    .where(eq(errorLogs.id, id))
    .returning();
  
  return result.length > 0;
}

export async function deleteError(id: string): Promise<boolean> {
  const result = await db.delete(errorLogs)
    .where(eq(errorLogs.id, id))
    .returning();
  
  return result.length > 0;
}

export async function getErrorStats(): Promise<{
  total: number;
  unresolved: number;
  byCategory: Record<string, number>;
  byLevel: Record<string, number>;
  recentCount: number;
}> {
  const [totalResult, unresolvedResult, byCategoryResult, byLevelResult, recentResult] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(errorLogs),
    db.select({ count: sql<number>`count(*)::int` }).from(errorLogs).where(eq(errorLogs.resolved, false)),
    db.select({ category: errorLogs.category, count: sql<number>`count(*)::int` })
      .from(errorLogs)
      .where(eq(errorLogs.resolved, false))
      .groupBy(errorLogs.category),
    db.select({ level: errorLogs.level, count: sql<number>`count(*)::int` })
      .from(errorLogs)
      .where(eq(errorLogs.resolved, false))
      .groupBy(errorLogs.level),
    db.select({ count: sql<number>`count(*)::int` })
      .from(errorLogs)
      .where(
        and(
          eq(errorLogs.resolved, false),
          sql`${errorLogs.lastSeenAt} > NOW() - INTERVAL '24 hours'`
        )
      )
  ]);

  const byCategory: Record<string, number> = {};
  for (const row of byCategoryResult) {
    byCategory[row.category] = row.count;
  }

  const byLevel: Record<string, number> = {};
  for (const row of byLevelResult) {
    byLevel[row.level] = row.count;
  }

  return {
    total: totalResult[0]?.count || 0,
    unresolved: unresolvedResult[0]?.count || 0,
    byCategory,
    byLevel,
    recentCount: recentResult[0]?.count || 0
  };
}
