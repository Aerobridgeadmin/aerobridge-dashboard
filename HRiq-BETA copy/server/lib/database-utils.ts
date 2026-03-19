import { db } from '../db';
import { logger } from './logger';
import { DatabaseError } from './errors';

export type TransactionClient = typeof db;

export async function withTransaction<T>(
  operation: (tx: TransactionClient) => Promise<T>,
  options: {
    maxRetries?: number;
    retryDelayMs?: number;
    isolationLevel?: 'read committed' | 'repeatable read' | 'serializable';
  } = {}
): Promise<T> {
  const { maxRetries = 3, retryDelayMs = 100 } = options;
  
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        return await operation(tx);
      });
    } catch (error: any) {
      lastError = error;
      
      const isRetryable = 
        error.code === '40001' ||
        error.code === '40P01' ||
        error.code === '23505' ||
        error.message?.includes('deadlock') ||
        error.message?.includes('could not serialize');
      
      if (!isRetryable || attempt === maxRetries) {
        logger.error(`[Transaction] Failed after ${attempt} attempts`, {
          error: error.message,
          code: error.code,
          attempt,
          maxRetries
        });
        throw new DatabaseError(`Transaction failed: ${error.message}`, {
          code: error.code,
          attempt,
          retryable: isRetryable
        });
      }
      
      const delay = retryDelayMs * Math.pow(2, attempt - 1);
      logger.warn(`[Transaction] Retrying after ${delay}ms (attempt ${attempt}/${maxRetries})`, {
        error: error.message,
        code: error.code
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError || new DatabaseError('Transaction failed with unknown error');
}

export async function withOptimisticLock<T>(
  readVersion: () => Promise<{ data: T; version: number }>,
  update: (data: T, version: number) => Promise<boolean>,
  maxRetries: number = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const { data, version } = await readVersion();
    
    const success = await update(data, version);
    
    if (success) {
      return data;
    }
    
    if (attempt < maxRetries) {
      const delay = 50 * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new DatabaseError('Optimistic lock failed: concurrent modification detected');
}

export function buildWhereClause<T extends Record<string, unknown>>(
  filters: T,
  operators: Partial<Record<keyof T, 'eq' | 'like' | 'ilike' | 'gte' | 'lte' | 'in'>> = {}
): { conditions: unknown[]; hasConditions: boolean } {
  const conditions: unknown[] = [];
  
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;
    
    conditions.push({ field: key, operator: operators[key] || 'eq', value });
  }
  
  return {
    conditions,
    hasConditions: conditions.length > 0
  };
}

export async function batchInsert<T extends Record<string, unknown>>(
  table: any,
  records: T[],
  batchSize: number = 100
): Promise<number> {
  let inserted = 0;
  
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    
    try {
      await db.insert(table).values(batch);
      inserted += batch.length;
    } catch (error: any) {
      logger.error(`[BatchInsert] Failed at batch ${Math.floor(i / batchSize) + 1}`, {
        error: error.message,
        batchStart: i,
        batchSize: batch.length
      });
      throw error;
    }
  }
  
  return inserted;
}

export async function batchUpdate<T>(
  items: T[],
  updateFn: (item: T) => Promise<void>,
  options: {
    batchSize?: number;
    delayBetweenBatchesMs?: number;
    onProgress?: (processed: number, total: number) => void;
  } = {}
): Promise<{ processed: number; failed: number; errors: Error[] }> {
  const { batchSize = 50, delayBetweenBatchesMs = 0, onProgress } = options;
  
  let processed = 0;
  let failed = 0;
  const errors: Error[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    await Promise.all(
      batch.map(async (item) => {
        try {
          await updateFn(item);
          processed++;
        } catch (error: any) {
          failed++;
          errors.push(error);
          logger.warn(`[BatchUpdate] Item failed`, { error: error.message });
        }
      })
    );
    
    onProgress?.(processed + failed, items.length);
    
    if (delayBetweenBatchesMs > 0 && i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatchesMs));
    }
  }
  
  return { processed, failed, errors };
}

export async function paginate<T>(
  query: () => Promise<T[]>,
  countQuery: () => Promise<number>,
  options: { page: number; limit: number }
): Promise<{
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}> {
  const [data, total] = await Promise.all([query(), countQuery()]);
  
  const totalPages = Math.ceil(total / options.limit);
  
  return {
    data,
    meta: {
      page: options.page,
      limit: options.limit,
      total,
      totalPages,
      hasNext: options.page < totalPages,
      hasPrev: options.page > 1
    }
  };
}
