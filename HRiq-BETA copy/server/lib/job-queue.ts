import { EventEmitter } from "events";
import { logger } from "./logger";
import crypto from "crypto";

export type JobStatus = "pending" | "processing" | "completed" | "failed";

export interface Job<T = unknown> {
  id: string;
  type: string;
  data: T;
  status: JobStatus;
  progress: number;
  result?: unknown;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  attempts: number;
  maxAttempts: number;
}

export interface JobProgress {
  jobId: string;
  type: string;
  status: JobStatus;
  progress: number;
  message?: string;
  result?: unknown;
  error?: string;
}

type JobProcessor<T> = (job: Job<T>, updateProgress: (progress: number, message?: string) => void) => Promise<unknown>;

class JobQueue extends EventEmitter {
  private jobs: Map<string, Job> = new Map();
  private processors: Map<string, JobProcessor<unknown>> = new Map();
  private processing: Set<string> = new Set();
  private concurrency: number = 5;
  private isRunning: boolean = false;

  constructor(concurrency: number = 5) {
    super();
    this.concurrency = concurrency;
  }

  registerProcessor<T>(type: string, processor: JobProcessor<T>): void {
    this.processors.set(type, processor as JobProcessor<unknown>);
    logger.info(`Registered job processor: ${type}`);
  }

  enqueue<T>(type: string, data: T, maxAttempts: number = 3): Job<T> {
    const job: Job<T> = {
      id: crypto.randomBytes(8).toString("hex"),
      type,
      data,
      status: "pending",
      progress: 0,
      createdAt: new Date(),
      attempts: 0,
      maxAttempts,
    };

    this.jobs.set(job.id, job as Job);
    logger.info(`Job enqueued`, { jobId: job.id, type });
    
    this.emitProgress(job as Job);
    this.processNext();
    
    return job;
  }

  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  getJobsByType(type: string): Job[] {
    return Array.from(this.jobs.values()).filter(j => j.type === type);
  }

  getAllJobs(): Job[] {
    return Array.from(this.jobs.values());
  }

  getStats(): { pending: number; processing: number; completed: number; failed: number } {
    const jobs = this.getAllJobs();
    return {
      pending: jobs.filter(j => j.status === "pending").length,
      processing: jobs.filter(j => j.status === "processing").length,
      completed: jobs.filter(j => j.status === "completed").length,
      failed: jobs.filter(j => j.status === "failed").length,
    };
  }

  private emitProgress(job: Job): void {
    const progress: JobProgress = {
      jobId: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      result: job.result,
      error: job.error,
    };
    this.emit("progress", progress);
  }

  private async processNext(): Promise<void> {
    if (this.processing.size >= this.concurrency) {
      return;
    }

    const pendingJob = Array.from(this.jobs.values()).find(
      j => j.status === "pending" && !this.processing.has(j.id)
    );

    if (!pendingJob) {
      return;
    }

    const processor = this.processors.get(pendingJob.type);
    if (!processor) {
      logger.error(`No processor for job type: ${pendingJob.type}`, { jobId: pendingJob.id });
      pendingJob.status = "failed";
      pendingJob.error = `No processor registered for type: ${pendingJob.type}`;
      this.emitProgress(pendingJob);
      return;
    }

    this.processing.add(pendingJob.id);
    pendingJob.status = "processing";
    pendingJob.startedAt = new Date();
    pendingJob.attempts++;
    this.emitProgress(pendingJob);

    const updateProgress = (progress: number, message?: string) => {
      pendingJob.progress = progress;
      const progressData: JobProgress = {
        jobId: pendingJob.id,
        type: pendingJob.type,
        status: pendingJob.status,
        progress,
        message,
      };
      this.emit("progress", progressData);
    };

    try {
      const result = await processor(pendingJob, updateProgress);
      pendingJob.status = "completed";
      pendingJob.progress = 100;
      pendingJob.result = result;
      pendingJob.completedAt = new Date();
      logger.info(`Job completed`, { jobId: pendingJob.id, type: pendingJob.type });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (pendingJob.attempts < pendingJob.maxAttempts) {
        logger.warn(`Job failed, will retry`, { jobId: pendingJob.id, attempts: pendingJob.attempts }, error as Error);
        pendingJob.status = "pending";
        pendingJob.progress = 0;
      } else {
        logger.error(`Job failed after max attempts`, { jobId: pendingJob.id, attempts: pendingJob.attempts }, error as Error);
        pendingJob.status = "failed";
        pendingJob.error = errorMessage;
        pendingJob.completedAt = new Date();
      }
    } finally {
      this.processing.delete(pendingJob.id);
      this.emitProgress(pendingJob);
      setImmediate(() => this.processNext());
    }
  }

  cleanOldJobs(maxAgeMs: number = 3600000): number {
    const cutoff = Date.now() - maxAgeMs;
    let cleaned = 0;
    
    const entries = Array.from(this.jobs.entries());
    for (const [id, job] of entries) {
      if (job.completedAt && job.completedAt.getTime() < cutoff) {
        this.jobs.delete(id);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.info(`Cleaned ${cleaned} old jobs`);
    }
    
    return cleaned;
  }
}

export const jobQueue = new JobQueue(5);

setInterval(() => {
  jobQueue.cleanOldJobs(3600000);
}, 300000);
