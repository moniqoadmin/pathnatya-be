import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditTrailModule } from '../audit-trail/audit-trail.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { Account } from './entities/account.entity';
import { Team } from './entities/team.entity';
import { BulkFlagJob } from './entities/bulk-flag-job.entity';
import { BulkFlagJobError } from './entities/bulk-flag-job-error.entity';
import { AccountsSeedService } from './accounts.seed';
import { AccountsService } from './accounts.service';
import { BulkAccountsUploadService } from './bulk-accounts-upload.service';
import { BulkFlagsJobService } from './bulk-flags-job.service';
import { BulkFlagsQueueService } from './bulk-flags-queue.service';
import { AccountsController } from './accounts.controller';
import { TeamItemController, TeamsController } from './teams.controller';
import { JweService } from './jwe.service';
import { JweAuthGuard } from './guards/jwe-auth.guard';
import { AppKeyGuard } from './guards/app-key.guard';
import { RolesGuard } from './guards/roles.guard';
import { LoginProtectionService } from './login-protection.service';
import { PasswordVerificationService } from './password-verification.service';
import { AppCacheService } from '../config/app-cache.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Account, Team, BulkFlagJob, BulkFlagJobError]),
    forwardRef(() => AuditTrailModule),
    forwardRef(() => EntitlementsModule),
  ],
  controllers: [AccountsController, TeamsController, TeamItemController],
  providers: [
    AccountsService,
    AccountsSeedService,
    BulkAccountsUploadService,
    BulkFlagsJobService,
    BulkFlagsQueueService,
    JweService,
    JweAuthGuard,
    AppKeyGuard,
    RolesGuard,
    LoginProtectionService,
    PasswordVerificationService,
    AppCacheService,
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
