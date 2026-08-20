import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from '../accounts/entities/account.entity';
import { AccountsModule } from '../accounts/accounts.module';
import { AuditTrailController } from './audit-trail.controller';
import { AuditTrailService } from './audit-trail.service';
import { AuditTrail } from './entities/audit-trail.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditTrail, Account]),
    forwardRef(() => AccountsModule),
  ],
  controllers: [AuditTrailController],
  providers: [AuditTrailService],
  exports: [AuditTrailService],
})
export class AuditTrailModule {}
