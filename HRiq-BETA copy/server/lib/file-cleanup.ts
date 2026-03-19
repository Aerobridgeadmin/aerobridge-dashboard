import fs from "fs";
import path from "path";
import os from "os";
import { logger } from "./logger";

const UPLOAD_DIR = path.join(os.tmpdir(), "resume-uploads");
const MAX_FILE_AGE_MS = 30 * 60 * 1000;
const MAX_FILE_SIZE_MB = 50;
const MAX_TOTAL_SIZE_MB = 500;

export function ensureUploadDir(): string {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    logger.info(`Created upload directory: ${UPLOAD_DIR}`);
  }
  return UPLOAD_DIR;
}

export function cleanupFile(filePath: string): boolean {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.debug(`Cleaned up file: ${filePath}`);
      return true;
    }
  } catch (error) {
    logger.warn(`Failed to cleanup file: ${filePath}`, {}, error as Error);
  }
  return false;
}

export function cleanupFiles(filePaths: string[]): number {
  let cleaned = 0;
  for (const filePath of filePaths) {
    if (cleanupFile(filePath)) {
      cleaned++;
    }
  }
  return cleaned;
}

export function validateFileSize(filePath: string): boolean {
  try {
    const stats = fs.statSync(filePath);
    const sizeMB = stats.size / (1024 * 1024);
    if (sizeMB > MAX_FILE_SIZE_MB) {
      logger.warn(`File exceeds size limit: ${sizeMB.toFixed(2)}MB > ${MAX_FILE_SIZE_MB}MB`, { filePath });
      return false;
    }
    return true;
  } catch (error) {
    logger.warn(`Failed to validate file size: ${filePath}`, {}, error as Error);
    return false;
  }
}

export function cleanupOldFiles(): number {
  let cleaned = 0;
  
  try {
    if (!fs.existsSync(UPLOAD_DIR)) {
      return 0;
    }

    const files = fs.readdirSync(UPLOAD_DIR);
    const now = Date.now();

    for (const file of files) {
      const filePath = path.join(UPLOAD_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;
        
        if (age > MAX_FILE_AGE_MS) {
          fs.unlinkSync(filePath);
          cleaned++;
          logger.debug(`Cleaned old file: ${file}`, { ageMinutes: Math.round(age / 60000) });
        }
      } catch (err) {
        logger.warn(`Error checking file: ${file}`, {}, err as Error);
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned ${cleaned} old upload files`);
    }
  } catch (error) {
    logger.error(`Error during cleanup sweep`, {}, error as Error);
  }

  return cleaned;
}

export function getUploadDirStats(): { fileCount: number; totalSizeMB: number } {
  try {
    if (!fs.existsSync(UPLOAD_DIR)) {
      return { fileCount: 0, totalSizeMB: 0 };
    }

    const files = fs.readdirSync(UPLOAD_DIR);
    let totalSize = 0;

    for (const file of files) {
      try {
        const stats = fs.statSync(path.join(UPLOAD_DIR, file));
        totalSize += stats.size;
      } catch {}
    }

    return {
      fileCount: files.length,
      totalSizeMB: totalSize / (1024 * 1024),
    };
  } catch {
    return { fileCount: 0, totalSizeMB: 0 };
  }
}

export function checkDiskSpace(): boolean {
  const stats = getUploadDirStats();
  if (stats.totalSizeMB > MAX_TOTAL_SIZE_MB) {
    logger.warn(`Upload directory exceeds limit: ${stats.totalSizeMB.toFixed(2)}MB > ${MAX_TOTAL_SIZE_MB}MB`);
    cleanupOldFiles();
    return false;
  }
  return true;
}

setInterval(cleanupOldFiles, 5 * 60 * 1000);

cleanupOldFiles();
