import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfiguration } from './entities/app-configuration.entity';
import { ServerApiUrl } from './entities/server-api-url.entity';
import { ServerApiUrlsController } from './server-api-urls.controller';
import { ServerApiUrlsService } from './server-api-urls.service';

@Module({
  imports: [TypeOrmModule.forFeature([AppConfiguration, ServerApiUrl])],
  controllers: [ServerApiUrlsController],
  providers: [ServerApiUrlsService],
})
export class ConfigurationStorageModule {}
