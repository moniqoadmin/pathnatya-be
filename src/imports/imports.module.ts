import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsModule } from '../accounts/accounts.module';
import { AccountImportJobError } from './entities/account-import-job-error.entity';
import { AccountImportJob } from './entities/account-import-job.entity';
import { AccountImportService } from './account-import.service';
import { ImportQueueService } from './import-queue.service';
import { ImportsController } from './imports.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([AccountImportJob, AccountImportJobError]),
    AccountsModule,
  ],
  providers: [AccountImportService, ImportQueueService],
  controllers: [ImportsController],
  exports: [AccountImportService, ImportQueueService],
})
export class ImportsModule {}
