import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { RedisService } from '../redis/redis.service';
import { AccountImportService } from './account-import.service';

const QUEUE_NAME = 'account-imports';

@Injectable()
export class ImportQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImportQueueService.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly imports: AccountImportService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.redis.isConfigured()) {
      this.logger.warn(
        'Import queue disabled because REDIS_URL is not configured',
      );
      return;
    }
    const connection = await this.redis.ensureConnected();
    this.queue = new Queue(QUEUE_NAME, { connection });
    const configuredConcurrency = Number(
      this.config.get('IMPORT_QUEUE_CONCURRENCY', 1),
    );
    const concurrency =
      Number.isInteger(configuredConcurrency) && configuredConcurrency > 0
        ? configuredConcurrency
        : 1;

    // Every API replica hosts a worker. The Redis-backed global limit keeps the
    // combined concurrency bounded even when Railway runs multiple replicas.
    await this.queue.setGlobalConcurrency(concurrency);
    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => this.imports.process(job.data.importJobId as string),
      {
        connection: connection.duplicate(),
        concurrency,
      },
    );
    this.worker.on('failed', (job, error) =>
      this.logger.error(
        `Import job ${job?.id ?? 'unknown'} failed: ${error.message}`,
      ),
    );
    this.worker.on('error', (error) =>
      this.logger.error(`Import worker error: ${error.message}`),
    );
    this.logger.log(
      `Import worker enabled with global concurrency ${concurrency}`,
    );
  }

  async enqueue(importJobId: string): Promise<void> {
    if (!this.queue) throw new Error('Import queue is unavailable');
    await this.queue.add(
      'account-import',
      { importJobId },
      {
        jobId: importJobId,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
