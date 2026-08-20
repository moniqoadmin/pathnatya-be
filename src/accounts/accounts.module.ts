import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditTrailModule } from '../audit-trail/audit-trail.module';
import { Account } from './entities/account.entity';
import { Team } from './entities/team.entity';
import { AccountsService } from './accounts.service';
import { BulkAccountsUploadService } from './bulk-accounts-upload.service';
import { AccountsController } from './accounts.controller';
import { TeamsController } from './teams.controller';
import { JweService } from './jwe.service';
import { JweAuthGuard } from './guards/jwe-auth.guard';
import { AppKeyGuard } from './guards/app-key.guard';
import { RolesGuard } from './guards/roles.guard';
import { LoginProtectionService } from './login-protection.service';
import { PasswordVerificationService } from './password-verification.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Account, Team]),
    forwardRef(() => AuditTrailModule),
  ],
  controllers: [AccountsController, TeamsController],
  providers: [
    AccountsService,
    BulkAccountsUploadService,
    JweService,
    JweAuthGuard,
    AppKeyGuard,
    RolesGuard,
    LoginProtectionService,
    PasswordVerificationService,
  ],
  exports: [
    TypeOrmModule,
    AccountsService,
    BulkAccountsUploadService,
    JweService,
    JweAuthGuard,
    AppKeyGuard,
    RolesGuard,
  ],
})
export class AccountsModule {}
