import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsModule } from '../accounts/accounts.module';
import { ExcelAnalyzerService } from './excel-analyzer.service';
import { ExcelMergeController } from './excel-merge.controller';
import { ExcelMergeService } from './excel-merge.service';
import { MergeTask } from './entities/merge-task.entity';
import { MergeTaskColumn } from './entities/task-column.entity';
import { MergeTaskData } from './entities/task-data.entity';
import { MergeTaskError } from './entities/task-error.entity';
import { MergeUploadedFile } from './entities/uploaded-file.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MergeTask,
      MergeTaskColumn,
      MergeUploadedFile,
      MergeTaskData,
      MergeTaskError,
    ]),
    AccountsModule,
  ],
  controllers: [ExcelMergeController],
  providers: [ExcelMergeService, ExcelAnalyzerService],
  exports: [ExcelMergeService],
})
export class ExcelMergeModule {}
