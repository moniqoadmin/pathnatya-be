import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { Roles } from '../accounts/decorators/roles.decorator';
import { OptionalAdminQueryDto } from '../accounts/dto/optional-admin-query.dto';
import { AccountRole } from '../accounts/entities/account.entity';
import { AppKeyGuard } from '../accounts/guards/app-key.guard';
import { JweAuthGuard } from '../accounts/guards/jwe-auth.guard';
import { RolesGuard } from '../accounts/guards/roles.guard';
import { CreateEntitlementDto } from './dto/create-entitlement.dto';
import { UpdateEntitlementDto } from './dto/update-entitlement.dto';
import { EntitlementsService } from './entitlements.service';

@ApiTags('entitlements')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-App-Key',
  description: 'Shared secret embedded in the Electron app',
  required: true,
})
@UseGuards(AppKeyGuard, JweAuthGuard, RolesGuard)
@Controller('entitlements')
export class EntitlementsController {
  constructor(private readonly entitlementsService: EntitlementsService) {}

  @Get()
  @ApiOperation({
    summary:
      'List feature entitlements. The Electron app and admin dashboard read these flags and adjust behavior. ADMIN_LOGIN_ELECTRON_APP and SHOW_ANALYTICS are seeded enabled by default.',
  })
  findAll(@Query() _query: OptionalAdminQueryDto) {
    return this.entitlementsService.findAll();
  }

  @Get(':key')
  @ApiOperation({
    summary: 'Get one entitlement by key. Optional admin query flag.',
  })
  findOne(@Param('key') key: string, @Query() _query: OptionalAdminQueryDto) {
    return this.entitlementsService.findOne(key);
  }

  @Roles(AccountRole.SUPER_ADMIN, AccountRole.DEVELOPER)
  @Post()
  @ApiOperation({
    summary:
      'Add an entitlement. SuperAdmin and Developer only. Writes an audit-trail entry for the caller.',
  })
  create(@Req() req: Request, @Body() dto: CreateEntitlementDto) {
    return this.entitlementsService.create(req.user!.sub, dto);
  }

  @Roles(AccountRole.SUPER_ADMIN, AccountRole.DEVELOPER)
  @Patch(':key')
  @ApiOperation({
    summary:
      'Update an entitlement (enabled / description). SuperAdmin and Developer only. Writes an audit-trail entry for the caller.',
  })
  update(
    @Req() req: Request,
    @Param('key') key: string,
    @Body() dto: UpdateEntitlementDto,
  ) {
    return this.entitlementsService.update(req.user!.sub, key, dto);
  }
}
