import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BulkFlagsJobService } from './bulk-flags-job.service';

@Injectable()
export class BulkFlagsQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(BulkFlagsQueueService.name);
  private readonly pending: string[] = [];
  private running = 0;
  private readonly concurrency: number;

  constructor(
    private readonly config: ConfigService,
    private readonly jobs: BulkFlagsJobService,
  ) {
    const configuredConcurrency = Number(
      this.config.get('BULK_FLAGS_QUEUE_CONCURRENCY', 1),
    );
    this.concurrency =
      Number.isInteger(configuredConcurrency) && configuredConcurrency > 0
        ? configuredConcurrency
        : 1;
  }

  async enqueue(jobId: string): Promise<void> {
    this.pending.push(jobId);
    void this.drain();
  }

  async onModuleDestroy(): Promise<void> {
    this.pending.length = 0;
  }

  private drain(): void {
    while (this.running < this.concurrency && this.pending.length > 0) {
      const jobId = this.pending.shift();
      if (!jobId) return;
      this.running += 1;
      void this.run(jobId);
    }
  }

  private async run(jobId: string): Promise<void> {
    try {
      await this.jobs.process(jobId);
    } catch (error) {
      this.logger.error(
        `Bulk flags job ${jobId} failed: ${(error as Error).message}`,
      );
    } finally {
      this.running -= 1;
      this.drain();
    }
  }
}
