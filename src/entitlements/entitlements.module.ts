import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsModule } from '../accounts/accounts.module';
import { AuditTrailModule } from '../audit-trail/audit-trail.module';
import { EntitlementsController } from './entitlements.controller';
import { EntitlementsService } from './entitlements.service';
import { Entitlement } from './entities/entitlement.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Entitlement]),
    forwardRef(() => AccountsModule),
    AuditTrailModule,
  ],
  controllers: [EntitlementsController],
  providers: [EntitlementsService],
  exports: [EntitlementsService],
})
export class EntitlementsModule {}
