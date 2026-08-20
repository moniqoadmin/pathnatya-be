import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { AuditTrailService } from './audit-trail.service';
import { CreateAuditTrailDto } from './dto/create-audit-trail.dto';
import { ListAuditTrailQueryDto } from './dto/list-audit-trail-query.dto';

@ApiTags('audit-trail')
@ApiHeader({
  name: 'X-App-Key',
  description: 'Shared secret embedded in the Electron app',
  required: true,
})
@ApiBearerAuth()
@UseGuards(AppKeyGuard, JweAuthGuard, RolesGuard)
@Roles(AccountRole.ADMIN, AccountRole.SUPER_ADMIN, AccountRole.DEVELOPER)
@Controller('audit-trail')
export class AuditTrailController {
  constructor(private readonly auditTrailService: AuditTrailService) {}

  @Post()
  @ApiOperation({
    summary:
      'Record an admin-panel action. accountId is taken from the auth token. Admin, SuperAdmin, and Developer only.',
  })
  create(@Req() req: Request, @Body() createAuditTrailDto: CreateAuditTrailDto) {
    return this.auditTrailService.create(req.user!.sub, createAuditTrailDto);
  }

  @Get()
  @ApiOperation({
    summary:
      'List audit-trail entries, newest first (paginated). name is the actor sanchalakName; kendra is from the target account. Optional admin query flag. Admin, SuperAdmin, and Developer only.',
  })
  findAll(@Query() query: ListAuditTrailQueryDto) {
    return this.auditTrailService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Get one audit-trail entry by id. Optional admin query flag. Admin, SuperAdmin, and Developer only.',
  })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() _query: OptionalAdminQueryDto,
  ) {
    return this.auditTrailService.findOne(id);
  }
}
