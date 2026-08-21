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
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  async upload(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!file) {
      throw new BadRequestException(
        'No file uploaded (field name must be "file")',
      );
    }
    const job = await this.imports.create(file, req.user!.sub);
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

  @Get('upload')
  @ApiOperation({
    summary:
      'List account-import jobs, newest first (paginated). Optional status filter (queued, processing, completed, failed). SuperAdmin and Developer only.',
  })
  async findAll(@Req() req: Request, @Query() query: ListImportJobsQueryDto) {
    const caller = await this.accounts.findOne(req.user!.sub);
    return this.imports.findAll(caller.role, query);
  }

  @Get('upload/:jobId')
  async status(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Req() req: Request,
    @Query() _query: OptionalAdminQueryDto,
  ) {
    const caller = await this.accounts.findOne(req.user!.sub);
    return this.imports.findOne(jobId, caller.role);
  }

  @Get('upload/:jobId/errors')
  async errors(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Req() req: Request,
    @Query() query: ListImportErrorsQueryDto,
  ) {
    const caller = await this.accounts.findOne(req.user!.sub);
    return this.imports.findErrors(jobId, caller.role, query);
  }
}
