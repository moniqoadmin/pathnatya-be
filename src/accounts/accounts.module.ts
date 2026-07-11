import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from './entities/account.entity';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';
import { JweService } from './jwe.service';
import { JweAuthGuard } from './guards/jwe-auth.guard';
import { AppKeyGuard } from './guards/app-key.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Account])],
  controllers: [AccountsController],
  providers: [AccountsService, JweService, JweAuthGuard, AppKeyGuard],
  exports: [AccountsService],
})
export class AccountsModule {}
