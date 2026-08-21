import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { AccountsService } from './accounts.service';
import { OptionalAdminQueryDto } from './dto/optional-admin-query.dto';
import { PatchTeamDto } from './dto/update-team.dto';
import { AppKeyGuard } from './guards/app-key.guard';
import { JweAuthGuard } from './guards/jwe-auth.guard';

@ApiTags('teams')
@ApiHeader({
  name: 'X-App-Key',
  description: 'Shared secret embedded in the Electron app',
  required: true,
})
@ApiBearerAuth()
@UseGuards(AppKeyGuard, JweAuthGuard)
@Controller('accounts')
export class TeamsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get(':accountId/teams')
  @ApiOperation({
    summary:
      'List teams for an account. Optional admin query flag. Each team includes its id for GET /teams/:teamId and PATCH /accounts/:accountId/teams/:teamId. Users may view their own teams. Admins may view User accounts in their sanghat. SuperAdmin and Developer may view any account.',
  })
  findAll(
    @Req() req: Request,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Query() _query: OptionalAdminQueryDto,
  ) {
    return this.accountsService.findTeams(req.user!.sub, accountId);
  }

  @Patch(':accountId/teams/:teamId')
  @ApiOperation({
    summary:
      'Update one team by id (password reset, login disable, password). Optional admin query flag. setPassword=true also clears the bound system address. Enabling login (isLoginDisabled=false) requires reason and writes a USER_ENABLED audit-trail entry. Admins may only set setPassword (false → true) and isLoginDisabled, and only for Users in their sanghat. SuperAdmin and Developer may also set password.',
  })
  update(
    @Req() req: Request,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Query() _query: OptionalAdminQueryDto,
    @Body() patchTeamDto: PatchTeamDto,
  ) {
    return this.accountsService.updateTeam(
      req.user!.sub,
      accountId,
      teamId,
      patchTeamDto,
    );
  }
}

@ApiTags('teams')
@ApiHeader({
  name: 'X-App-Key',
  description: 'Shared secret embedded in the Electron app',
  required: true,
})
@ApiBearerAuth()
@UseGuards(AppKeyGuard, JweAuthGuard)
@Controller('teams')
export class TeamItemController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get(':teamId')
  @ApiOperation({
    summary:
      'Get one team by id from the teams table. Optional admin query flag. Users may view their own teams. Admins may view User accounts in their sanghat. SuperAdmin and Developer may view any account.',
  })
  findOne(
    @Req() req: Request,
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Query() _query: OptionalAdminQueryDto,
  ) {
    return this.accountsService.findTeam(req.user!.sub, teamId);
  }
}
