import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsModule } from '../accounts/accounts.module';
import { Log } from './entities/log.entity';
import { AccountLogsController, LogsController } from './logs.controller';
import { LogsService } from './logs.service';

@Module({
  imports: [TypeOrmModule.forFeature([Log]), AccountsModule],
  controllers: [LogsController, AccountLogsController],
  providers: [LogsService],
  exports: [LogsService],
})
export class LogsModule {}
