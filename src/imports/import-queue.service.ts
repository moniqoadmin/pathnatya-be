import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountImportService } from './account-import.service';

@Injectable()
export class ImportQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(ImportQueueService.name);
  private readonly pending: string[] = [];
  private running = 0;
  private readonly concurrency: number;

  constructor(
    private readonly config: ConfigService,
    private readonly imports: AccountImportService,
  ) {
    const configuredConcurrency = Number(
      this.config.get('IMPORT_QUEUE_CONCURRENCY', 1),
    );
    this.concurrency =
      Number.isInteger(configuredConcurrency) && configuredConcurrency > 0
        ? configuredConcurrency
        : 1;
  }

  async enqueue(importJobId: string): Promise<void> {
    this.pending.push(importJobId);
    void this.drain();
  }

  async onModuleDestroy(): Promise<void> {
    this.pending.length = 0;
  }

  private drain(): void {
    while (this.running < this.concurrency && this.pending.length > 0) {
      const importJobId = this.pending.shift();
      if (!importJobId) return;
      this.running += 1;
      void this.run(importJobId);
    }
  }

  private async run(importJobId: string): Promise<void> {
    try {
      await this.imports.process(importJobId);
    } catch (error) {
      this.logger.error(
        `Import job ${importJobId} failed: ${(error as Error).message}`,
      );
    } finally {
      this.running -= 1;
      this.drain();
    }
  }
}
