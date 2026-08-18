import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from './entities/account.entity';
import { Team } from './entities/team.entity';
import { AccountsService } from './accounts.service';
import { BulkAccountsUploadService } from './bulk-accounts-upload.service';
import { AccountsController } from './accounts.controller';
import { JweService } from './jwe.service';
import { JweAuthGuard } from './guards/jwe-auth.guard';
import { AppKeyGuard } from './guards/app-key.guard';
import { LoginProtectionService } from './login-protection.service';
import { PasswordVerificationService } from './password-verification.service';

@Module({
  imports: [TypeOrmModule.forFeature([Account, Team])],
  controllers: [AccountsController],
  providers: [
    AccountsService,
    BulkAccountsUploadService,
    JweService,
    JweAuthGuard,
    AppKeyGuard,
    LoginProtectionService,
    PasswordVerificationService,
  ],
  exports: [
    AccountsService,
    BulkAccountsUploadService,
    JweService,
    JweAuthGuard,
    AppKeyGuard,
  ],
})
export class AccountsModule {}
