import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Roles } from '../accounts/decorators/roles.decorator';
import { OptionalAdminQueryDto } from '../accounts/dto/optional-admin-query.dto';
import { AccountRole } from '../accounts/entities/account.entity';
import { AppKeyGuard } from '../accounts/guards/app-key.guard';
import { JweAuthGuard } from '../accounts/guards/jwe-auth.guard';
import { RolesGuard } from '../accounts/guards/roles.guard';
import { AppConfigurationsService } from './app-configurations.service';
import { UpdateAppConfigurationDto } from './dto/update-app-configuration.dto';
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
  @ApiOperation({
    summary:
      'List all application configurations. Any authenticated client may call this. With ?admin=true, SuperAdmin and Developer only.',
  })
  findAll(@Req() req: Request, @Query() query: OptionalAdminQueryDto) {
    return this.service.findAll(req.user!.sub, query.admin === true);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Get one application configuration by id. Authenticated clients may read the row assigned to an account via appConfiguration.',
  })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query() _query: OptionalAdminQueryDto,
  ) {
    return this.service.findOne(id);
  }

  @Roles(AccountRole.SUPER_ADMIN, AccountRole.DEVELOPER)
  @Post()
  @ApiOperation({
    summary:
      'Create or replace an application configuration by id. SuperAdmin and Developer only.',
  })
  upsert(@Body() dto: UpsertAppConfigurationDto) {
    return this.service.upsert(dto);
  }

  @Roles(AccountRole.SUPER_ADMIN, AccountRole.DEVELOPER)
  @Patch(':id')
  @ApiOperation({
    summary:
      'Update id, videoConfig, and/or videoFiles on an existing configuration. Changing id remaps accounts that pointed at the old id. SuperAdmin and Developer only.',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAppConfigurationDto,
  ) {
    return this.service.update(id, dto);
  }
}
