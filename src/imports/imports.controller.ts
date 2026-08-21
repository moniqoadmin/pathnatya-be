import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AccountsService } from '../accounts/accounts.service';
import { Roles } from '../accounts/decorators/roles.decorator';
import { AccountRole } from '../accounts/entities/account.entity';
import { AppKeyGuard } from '../accounts/guards/app-key.guard';
import { JweAuthGuard } from '../accounts/guards/jwe-auth.guard';
import { RolesGuard } from '../accounts/guards/roles.guard';
import { OptionalAdminQueryDto } from '../accounts/dto/optional-admin-query.dto';
import { AccountImportService } from './account-import.service';
import { ListImportErrorsQueryDto } from './dto/list-import-errors-query.dto';
import { ListImportJobsQueryDto } from './dto/list-import-jobs-query.dto';
import { ImportQueueService } from './import-queue.service';
import { AccountImportJobKind } from './entities/account-import-job.entity';

@ApiTags('account imports')
@ApiHeader({ name: 'X-App-Key', required: true })
@ApiBearerAuth()
@Roles(AccountRole.SUPER_ADMIN, AccountRole.DEVELOPER)
@UseGuards(AppKeyGuard, JweAuthGuard, RolesGuard)
@Controller('accounts/bulk')
export class ImportsController {
  constructor(
    private readonly imports: AccountImportService,
    private readonly queue: ImportQueueService,
    private readonly accounts: AccountsService,
  ) {}

  @Post('upload')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Queue an Excel import that creates accounts. SuperAdmin and Developer only. Poll GET /accounts/bulk/upload/:jobId.',
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  async upload(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    return this.enqueue(file, req.user!.sub, AccountImportJobKind.UPLOAD);
  }

  @Get('upload')
  @ApiOperation({
    summary:
      'List account-import jobs, newest first (paginated). Optional status filter (queued, processing, completed, failed). SuperAdmin and Developer only.',
  })
  async findAll(@Req() req: Request, @Query() query: ListImportJobsQueryDto) {
    const caller = await this.accounts.findOne(req.user!.sub);
    return this.imports.findAll(
      caller.role,
      query,
      AccountImportJobKind.UPLOAD,
    );
  }

  @Get('upload/:jobId')
  async status(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Req() req: Request,
    @Query() _query: OptionalAdminQueryDto,
  ) {
    const caller = await this.accounts.findOne(req.user!.sub);
    return this.imports.findOne(
      jobId,
      caller.role,
      AccountImportJobKind.UPLOAD,
    );
  }

  @Get('upload/:jobId/errors')
  async errors(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Req() req: Request,
    @Query() query: ListImportErrorsQueryDto,
  ) {
    const caller = await this.accounts.findOne(req.user!.sub);
    return this.imports.findErrors(
      jobId,
      caller.role,
      query,
      AccountImportJobKind.UPLOAD,
    );
  }

  @Post('teams')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Queue an Excel job that updates numberOfTeams for existing accounts. Phone numbers must already exist. Uses "Updated No. of Teams Expected" when that column is present, otherwise "No. of Teams Expected". SuperAdmin and Developer only. Poll GET /accounts/bulk/teams/:jobId. createdCount is the number of accounts updated.',
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  async updateTeams(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    return this.enqueue(file, req.user!.sub, AccountImportJobKind.UPDATE_TEAMS);
  }

  @Get('teams')
  @ApiOperation({
    summary:
      'List bulk team-number update jobs, newest first (paginated). Optional status filter (queued, processing, completed, failed). SuperAdmin and Developer only.',
  })
  async findTeamJobs(
    @Req() req: Request,
    @Query() query: ListImportJobsQueryDto,
  ) {
    const caller = await this.accounts.findOne(req.user!.sub);
    return this.imports.findAll(
      caller.role,
      query,
      AccountImportJobKind.UPDATE_TEAMS,
    );
  }

  @Get('teams/:jobId')
  @ApiOperation({
    summary:
      'Get one bulk team-number update job (poll until status is completed or failed). createdCount is the number of accounts updated. SuperAdmin and Developer only.',
  })
  async teamJobStatus(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Req() req: Request,
    @Query() _query: OptionalAdminQueryDto,
  ) {
    const caller = await this.accounts.findOne(req.user!.sub);
    return this.imports.findOne(
      jobId,
      caller.role,
      AccountImportJobKind.UPDATE_TEAMS,
    );
  }

  @Get('teams/:jobId/errors')
  @ApiOperation({
    summary:
      'List row errors for a bulk team-number update job (paginated). SuperAdmin and Developer only.',
  })
  async teamJobErrors(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Req() req: Request,
    @Query() query: ListImportErrorsQueryDto,
  ) {
    const caller = await this.accounts.findOne(req.user!.sub);
    return this.imports.findErrors(
      jobId,
      caller.role,
      query,
      AccountImportJobKind.UPDATE_TEAMS,
    );
  }

  private async enqueue(
    file: Express.Multer.File | undefined,
    requestedBy: string,
    kind: AccountImportJobKind,
  ) {
    if (!file) {
      throw new BadRequestException(
        'No file uploaded (field name must be "file")',
      );
    }
    const job = await this.imports.create(file, requestedBy, kind);
    try {
      await this.queue.enqueue(job.id);
    } catch {
      await this.imports.markQueueFailure(
        job.id,
        'Import queue is unavailable',
      );
      throw new ServiceUnavailableException(
        'Import queue is unavailable. Please try again shortly.',
      );
    }
    return { jobId: job.id, status: job.status };
  }
}
