import { useState, useEffect, useCallback } from "react";

const STORAGE_PREFIX = "rl_filter_";
const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

interface StoredValue<T> {
  value: T;
  timestamp: number;
  ttl: number;
}

function isExpired(storedValue: StoredValue<unknown>): boolean {
  return Date.now() - storedValue.timestamp > storedValue.ttl;
}

export function usePersistedState<T>(
  key: string,
  defaultValue: T,
  ttlMs: number = DEFAULT_TTL_MS
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const storageKey = `${STORAGE_PREFIX}${key}`;

  const [value, setValue] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed: StoredValue<T> = JSON.parse(stored);
        if (!isExpired(parsed)) {
          return parsed.value;
        }
        sessionStorage.removeItem(storageKey);
      }
    } catch {
      sessionStorage.removeItem(storageKey);
    }
    return defaultValue;
  });

  useEffect(() => {
    try {
      const storedValue: StoredValue<T> = {
        value,
        timestamp: Date.now(),
        ttl: ttlMs,
      };
      sessionStorage.setItem(storageKey, JSON.stringify(storedValue));
    } catch {
      // Storage might be full or disabled
    }
  }, [value, storageKey, ttlMs]);

  const clear = useCallback(() => {
    setValue(defaultValue);
    sessionStorage.removeItem(storageKey);
  }, [defaultValue, storageKey]);

  return [value, setValue, clear];
}

export function clearAllPersistedFilters(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // Storage might be disabled
  }
}

export function cleanupExpiredFilters(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) {
        try {
          const stored = sessionStorage.getItem(key);
          if (stored) {
            const parsed: StoredValue<unknown> = JSON.parse(stored);
            if (isExpired(parsed)) {
              keysToRemove.push(key);
            }
          }
        } catch {
          keysToRemove.push(key);
        }
      }
    }
    keysToRemove.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // Storage might be disabled
  }
}
