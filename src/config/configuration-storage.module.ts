import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsModule } from '../accounts/accounts.module';
import { AppConfigurationsController } from './app-configurations.controller';
import { AppConfigurationsService } from './app-configurations.service';
import { AppConfiguration } from './entities/app-configuration.entity';
import { ServerApiUrl } from './entities/server-api-url.entity';
import { ServerApiUrlsController } from './server-api-urls.controller';
import { ServerApiUrlsService } from './server-api-urls.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AppConfiguration, ServerApiUrl]),
    AccountsModule,
  ],
  controllers: [AppConfigurationsController, ServerApiUrlsController],
  providers: [AppConfigurationsService, ServerApiUrlsService],
})
export class ConfigurationStorageModule {}
