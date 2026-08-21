import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AccountsService } from './accounts.service';
import { BulkFlagsJobService } from './bulk-flags-job.service';
import { BulkFlagsQueueService } from './bulk-flags-queue.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { ListAccountsQueryDto } from './dto/list-accounts-query.dto';
import { LoginAnalyticsQueryDto } from './dto/login-analytics-query.dto';
import { BulkUpdateFlagsDto } from './dto/bulk-update-flags.dto';
import { ListBulkFlagErrorsQueryDto } from './dto/list-bulk-flag-errors-query.dto';
import { ListBulkFlagJobsQueryDto } from './dto/list-bulk-flag-jobs-query.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { LoginDto } from './dto/login.dto';
import { LoginQueryDto } from './dto/login-query.dto';
import { OptionalAdminQueryDto } from './dto/optional-admin-query.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { CheckPhoneDto } from './dto/check-phone.dto';
import { JweAuthGuard } from './guards/jwe-auth.guard';
import { AppKeyGuard } from './guards/app-key.guard';
import { RolesGuard } from './guards/roles.guard';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { JweService } from './jwe.service';
import { SkipPayloadEncryption } from '../crypto/skip-payload-encryption.decorator';
import { AccountRole } from './entities/account.entity';

/** Stricter per-IP limit for unauthenticated / credential endpoints. */
const AuthThrottle = () => Throttle({ default: { limit: 15, ttl: 60_000 } });

@ApiTags('accounts')
@ApiHeader({
  name: 'X-App-Key',
  description: 'Shared secret embedded in the Electron app',
  required: true,
})
@ApiBearerAuth()
@UseGuards(AppKeyGuard, JweAuthGuard, RolesGuard)
@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly bulkFlagsJobs: BulkFlagsJobService,
    private readonly bulkFlagsQueue: BulkFlagsQueueService,
    private readonly jweService: JweService,
  ) {}

  @Post()
  @ApiOperation({
    summary:
      'Create an account. Admin, SuperAdmin, and Developer only. Admins may only create User accounts in their sanghat. SuperAdmin and Developer may set role.',
  })
  create(@Req() req: Request, @Body() createAccountDto: CreateAccountDto) {
    return this.accountsService.createForCaller(
      req.user!.sub,
      createAccountDto,
    );
  }

  @Roles(AccountRole.SUPER_ADMIN, AccountRole.DEVELOPER)
  @SkipPayloadEncryption()
  @Get('bulk/template')
  @ApiOperation({
    summary:
      'Download an .xlsx template (headers only) to fill in and upload back. Includes account fields not present in the nivedan sheet (role, numberOfReboot, appConfiguration, logoutButton, isOffline, source). SuperAdmin and Developer only.',
  })
  async downloadTemplate(
    @Res() res: Response,
    @Query() _query: OptionalAdminQueryDto,
  ) {
    const buffer = await this.accountsService.generateTemplate();
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="accounts-template.xlsx"',
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Public()
  @AuthThrottle()
  @Post('check-phone')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Check if a phone number has an account. Uses the device ipAddress (MAC) to match a team. Returns { exists, needsPassword, role } from that account. Errors if the matching team has isLoginDisabled. When admin=true, ipAddress matching and device-team limits are skipped. When ADMIN_LOGIN_ELECTRON_APP is false, Admin / SuperAdmin / Developer accounts are rejected unless admin=true.',
  })
  checkPhone(
    @Body() checkPhoneDto: CheckPhoneDto,
    @Query() query: OptionalAdminQueryDto,
    @Ip() ipAddress: string,
  ) {
    return this.accountsService.checkPhone(
      checkPhoneDto.phoneNumber,
      checkPhoneDto.ipAddress ?? ipAddress,
      query.admin === true,
    );
  }

  @Public()
  @AuthThrottle()
  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Set or reset the password for this device team (matched by ipAddress / MAC). Optional metadata is stored on that team. Creates a team when this is a new IP and the account is under its team cap. Returns the account plus the teamNumber that was created or matched.',
  })
  setPassword(@Body() setPasswordDto: SetPasswordDto, @Ip() ipAddress: string) {
    return this.accountsService.setPassword(
      setPasswordDto,
      setPasswordDto.ipAddress ?? ipAddress,
    );
  }

  @Public()
  @AuthThrottle()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({
    name: 'X-Load-Test-Key',
    description:
      'When set to LOAD_TEST_KEY, skips rate limiting (for load testing only).',
    required: false,
  })
  @ApiOperation({
    summary:
      'Login with phone number + password. The device ipAddress (MAC) selects the team. Returns account, the matching team object, and a JWE token valid for 5 days (2 hours when admin=true). When admin=true, ipAddress matching, team binding, and device-team limits are skipped. When ADMIN_LOGIN_ELECTRON_APP is true, Admin / SuperAdmin / Developer may log in with admin true or false. When false, those roles may only log in with admin=true; the Electron app accepts User roles only.',
  })
  login(
    @Body() loginDto: LoginDto,
    @Query() query: LoginQueryDto,
    @Ip() ipAddress: string,
  ) {
    return this.accountsService.login(
      loginDto,
      loginDto.ipAddress ?? ipAddress,
      query.admin === true,
    );
  }

  @Get('login-token')
  @ApiOperation({
    summary: 'Return the five login success keys.',
  })
  getLoginToken() {
    return { keys: this.jweService.getLoginKeys() };
  }

  @Get('roles')
  @ApiOperation({ summary: 'Return all account roles.' })
  getRoles() {
    return { roles: Object.values(AccountRole) };
  }

  @Roles(AccountRole.SUPER_ADMIN, AccountRole.DEVELOPER)
  @Get('sanghats')
  @ApiOperation({
    summary:
      'List distinct sanghat names from the accounts table. SuperAdmin and Developer only.',
  })
  listSanghats() {
    return this.accountsService.listSanghats();
  }

  @Roles(AccountRole.SUPER_ADMIN, AccountRole.DEVELOPER)
  @Get('analytics')
  @ApiOperation({
    summary:
      'Login counts for SuperAdmin and Developer when entitlement SHOW_ANALYTICS is enabled. teamsLoggedIn is teams with lastLoginTime set; accountsLoggedIn is distinct accounts with at least one such team. Optional sanghat filter and since (ISO-8601) to count only logins at or after that time. Also returns totalAccounts and totalTeams. Cached in process memory for 3 hours per sanghat + since combination. Returns 403 when SHOW_ANALYTICS is disabled.',
  })
  getLoginAnalytics(@Query() query: LoginAnalyticsQueryDto) {
    return this.accountsService.getLoginAnalytics(query);
  }

  @Roles(AccountRole.SUPER_ADMIN, AccountRole.DEVELOPER)
  @Patch('sanghats/flags')
  @ApiOperation({
    summary:
      'Bulk-update account and/or team flags. With sanghat: runs immediately and returns usersChanged, teamsChanged, and errors. With all=true: queues a job and returns 202 { jobId, status }. Poll GET /accounts/sanghats/flags/jobs/:jobId. SuperAdmin and Developer only.',
  })
  async bulkUpdateFlags(
    @Req() req: Request,
    @Body() bulkUpdateFlagsDto: BulkUpdateFlagsDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (bulkUpdateFlagsDto.all === true) {
      const job = await this.bulkFlagsJobs.create(
        bulkUpdateFlagsDto,
        req.user!.sub,
      );
      try {
        await this.bulkFlagsQueue.enqueue(job.id);
      } catch {
        await this.bulkFlagsJobs.markQueueFailure(
          job.id,
          'Bulk flags queue is unavailable',
        );
        throw new ServiceUnavailableException(
          'Bulk flags queue is unavailable. Please try again shortly.',
        );
      }
      res.status(HttpStatus.ACCEPTED);
      return { jobId: job.id, status: job.status };
    }

    if (!bulkUpdateFlagsDto.sanghat?.trim()) {
      throw new BadRequestException('Provide sanghat or all=true');
    }

    return this.accountsService.bulkUpdateFlags(
      req.user!.sub,
      bulkUpdateFlagsDto,
    );
  }

  @Roles(AccountRole.SUPER_ADMIN, AccountRole.DEVELOPER)
  @Get('sanghats/flags/jobs')
  @ApiOperation({
    summary:
      'List bulk-flags jobs, newest first (paginated). Optional status filter (queued, processing, completed, failed). SuperAdmin and Developer only.',
  })
  async listBulkFlagJobs(
    @Req() req: Request,
    @Query() query: ListBulkFlagJobsQueryDto,
  ) {
    const caller = await this.accountsService.findOne(req.user!.sub);
    return this.bulkFlagsJobs.findAll(caller.role, query);
  }

  @Roles(AccountRole.SUPER_ADMIN, AccountRole.DEVELOPER)
  @Get('sanghats/flags/jobs/:jobId')
  @ApiOperation({
    summary:
      'Get one bulk-flags job (poll until status is completed or failed). SuperAdmin and Developer only.',
  })
  async getBulkFlagJob(
    @Req() req: Request,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ) {
    const caller = await this.accountsService.findOne(req.user!.sub);
    return this.bulkFlagsJobs.findOne(jobId, caller.role);
  }

  @Roles(AccountRole.SUPER_ADMIN, AccountRole.DEVELOPER)
  @Get('sanghats/flags/jobs/:jobId/errors')
  @ApiOperation({
    summary:
      'List unchanged-value errors for a bulk-flags job (paginated). SuperAdmin and Developer only.',
  })
  async getBulkFlagJobErrors(
    @Req() req: Request,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Query() query: ListBulkFlagErrorsQueryDto,
  ) {
    const caller = await this.accountsService.findOne(req.user!.sub);
    return this.bulkFlagsJobs.findErrors(jobId, caller.role, query);
  }

  @Get()
  @ApiOperation({
    summary:
      'List accounts (paginated). Optional admin query flag. Admins see Users in their sanghat only. SuperAdmins see all accounts and may filter by role or sanghat name. Search matches phone number or kendra name.',
  })
  findAll(@Req() req: Request, @Query() query: ListAccountsQueryDto) {
    return this.accountsService.findAll(req.user!.sub, query);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Get an account by id. Users may read their own account. Admins may read Users in their sanghat. SuperAdmin and Developer may read any account.',
  })
  findOne(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.accountsService.findOneForCaller(req.user!.sub, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Update an account from the account list. Admins may only edit setPassword (false → true, all teams), teams[].setPassword / teams[].isLoginDisabled, isOffline, numberOfTeams, numberOfReboot, logoutButton, and appConfiguration, and only for Users in their sanghat. SuperAdmin and Developer may edit all mutable fields. phoneNumber is immutable.',
  })
  update(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateAccountDto: UpdateAccountDto,
  ) {
    return this.accountsService.update(req.user!.sub, id, updateAccountDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Delete an account. Admin, SuperAdmin, and Developer only. Admins may only delete User accounts in their sanghat.',
  })
  remove(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.accountsService.remove(req.user!.sub, id);
  }
}
