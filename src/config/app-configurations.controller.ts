import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../accounts/decorators/roles.decorator';
import { AccountRole } from '../accounts/entities/account.entity';
import { AppKeyGuard } from '../accounts/guards/app-key.guard';
import { JweAuthGuard } from '../accounts/guards/jwe-auth.guard';
import { RolesGuard } from '../accounts/guards/roles.guard';
import { AppConfigurationsService } from './app-configurations.service';
import { UpsertAppConfigurationDto } from './dto/upsert-app-configuration.dto';

@ApiTags('app-configurations')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-App-Key',
  description: 'Shared secret embedded in the Electron app',
  required: true,
})
@UseGuards(AppKeyGuard, JweAuthGuard, RolesGuard)
@Controller('app-configurations')
export class AppConfigurationsController {
  constructor(private readonly service: AppConfigurationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all application configurations' })
  findAll() {
    return this.service.findAll();
  }

  @Roles(AccountRole.SUPER_ADMIN, AccountRole.DEVELOPER)
  @Post()
  @ApiOperation({
    summary:
      'Create or update an application configuration by id. SuperAdmin and Developer only.',
  })
  upsert(@Body() dto: UpsertAppConfigurationDto) {
    return this.service.upsert(dto);
  }
}
