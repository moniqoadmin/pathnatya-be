import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsModule } from '../accounts/accounts.module';
import { Account } from '../accounts/entities/account.entity';
import { AppConfigurationsController } from './app-configurations.controller';
import { AppConfigurationsService } from './app-configurations.service';
import { AppConfiguration } from './entities/app-configuration.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AppConfiguration, Account]),
    AccountsModule,
  ],
  controllers: [AppConfigurationsController],
  providers: [AppConfigurationsService],
})
export class ConfigurationStorageModule {}
