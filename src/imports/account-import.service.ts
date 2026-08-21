import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { AccountRole } from '../accounts/entities/account.entity';
import { BulkAccountsUploadService } from '../accounts/bulk-accounts-upload.service';
import { AccountImportJobError } from './entities/account-import-job-error.entity';
import {
  AccountImportJob,
  AccountImportJobKind,
  AccountImportJobStatus,
} from './entities/account-import-job.entity';
import { ListImportErrorsQueryDto } from './dto/list-import-errors-query.dto';
import { ListImportJobsQueryDto } from './dto/list-import-jobs-query.dto';

@Injectable()
export class AccountImportService {
  constructor(
    @InjectRepository(AccountImportJob)
    private readonly jobs: Repository<AccountImportJob>,
    @InjectRepository(AccountImportJobError)
    private readonly errors: Repository<AccountImportJobError>,
    private readonly uploader: BulkAccountsUploadService,
    private readonly config: ConfigService,
  ) {}

  async create(
    file: Express.Multer.File,
    requestedBy: string,
    kind: AccountImportJobKind = AccountImportJobKind.UPLOAD,
  ) {
    this.validateFile(file);
    await this.cleanupOldJobs();
    const job = await this.jobs.save(
      this.jobs.create({
        status: AccountImportJobStatus.QUEUED,
        kind,
        fileName: file.originalname,
        fileSize: file.size,
        fileData: file.buffer,
        requestedBy,
        totalRows: 0,
        createdCount: 0,
        failedCount: 0,
        failureMessage: null,
        startedAt: null,
        completedAt: null,
      }),
    );
    return job;
  }

  async markQueueFailure(jobId: string, message: string): Promise<void> {
    await this.jobs.update(jobId, {
      status: AccountImportJobStatus.FAILED,
      failureMessage: message,
      fileData: null,
      completedAt: new Date(),
    });
  }

  async findAll(
    role: AccountRole,
    query: ListImportJobsQueryDto,
    kind: AccountImportJobKind = AccountImportJobKind.UPLOAD,
  ) {
    this.assertCanRead(role);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [data, total] = await this.jobs.findAndCount({
      where: query.status ? { kind, status: query.status } : { kind },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findOne(
    id: string,
    role: AccountRole,
    kind: AccountImportJobKind = AccountImportJobKind.UPLOAD,
  ) {
    const job = await this.jobs.findOne({ where: { id, kind } });
    if (!job) throw new NotFoundException('Import job not found');
    this.assertCanRead(role);
    return job;
  }

  async findErrors(
    id: string,
    role: AccountRole,
    query: ListImportErrorsQueryDto,
    kind: AccountImportJobKind = AccountImportJobKind.UPLOAD,
  ) {
    await this.findOne(id, role, kind);
    const [data, total] = await this.errors.findAndCount({
      where: { jobId: id },
      order: { rowNumber: 'ASC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return {
      data,
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  async process(id: string): Promise<void> {
    const claimed = await this.jobs
      .createQueryBuilder()
      .update(AccountImportJob)
      .set({ status: AccountImportJobStatus.PROCESSING, startedAt: new Date() })
      .where('id = :id AND status IN (:...statuses)', {
        id,
        statuses: [
          AccountImportJobStatus.QUEUED,
          AccountImportJobStatus.PROCESSING,
        ],
      })
      .execute();
    if (!claimed.affected) return;

    const job = await this.jobs
      .createQueryBuilder('job')
      .addSelect('job.fileData')
      .where('job.id = :id', { id })
      .getOne();
    if (!job?.fileData) {
      await this.fail(id, 'Uploaded Excel file is no longer available');
      return;
    }

    try {
      const result =
        job.kind === AccountImportJobKind.UPDATE_TEAMS
          ? await this.uploader.bulkUpdateTeamNumbers(
              job.fileData,
              async (progress) => {
                await this.jobs.update(id, {
                  totalRows: progress.totalRows,
                  createdCount: progress.updated,
                  failedCount: progress.failed,
                });
              },
            )
          : await this.uploader.bulkUpload(job.fileData, async (progress) => {
              await this.jobs.update(id, {
                totalRows: progress.totalRows,
                createdCount: progress.created,
                failedCount: progress.failed,
              });
            });
      const succeeded = 'updated' in result ? result.updated : result.created;
      if (result.errors.length > 0) {
        for (let start = 0; start < result.errors.length; start += 500) {
          await this.errors.insert(
            result.errors.slice(start, start + 500).map((error) => ({
              jobId: id,
              rowNumber: error.row,
              sn: error.sn,
              country: error.country,
              sanghat: error.sanghat,
              jilha: error.jilha,
              taluka: error.taluka,
              group: error.group,
              kendra: error.kendra,
              sanchalakName: error.sanchalakName,
              phoneNumber: error.phoneNumber,
              error: error.error,
            })),
          );
        }
      }
      await this.jobs.update(id, {
        status: AccountImportJobStatus.COMPLETED,
        totalRows: result.totalRows,
        createdCount: succeeded,
        failedCount: result.failed,
        fileData: null,
        completedAt: new Date(),
      });
    } catch (error) {
      await this.fail(id, (error as Error).message || 'Import failed');
      throw error;
    }
  }

  private async fail(id: string, message: string): Promise<void> {
    await this.jobs.update(id, {
      status: AccountImportJobStatus.FAILED,
      failureMessage: message,
      fileData: null,
      completedAt: new Date(),
    });
  }

  private validateFile(file: Express.Multer.File): void {
    const maxMb = Number(this.config.get('IMPORT_MAX_FILE_SIZE_MB', 20));
    const allowedMimeTypes = new Set([
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream',
    ]);
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException('Only .xlsx files are supported');
    }
    if (!allowedMimeTypes.has(file.mimetype)) {
      throw new BadRequestException('The uploaded file must be an .xlsx file');
    }
    if (!file.size || file.size > maxMb * 1024 * 1024) {
      throw new BadRequestException(
        `Excel file must be smaller than ${maxMb} MB`,
      );
    }
    if (
      file.buffer.length < 4 ||
      file.buffer.subarray(0, 2).toString() !== 'PK'
    ) {
      throw new BadRequestException(
        'The uploaded file is not a valid .xlsx file',
      );
    }
  }

  private assertCanRead(role: AccountRole): void {
    if (role !== AccountRole.SUPER_ADMIN && role !== AccountRole.DEVELOPER) {
      throw new ForbiddenException('You cannot access this import job');
    }
  }

  private async cleanupOldJobs(): Promise<void> {
    const retentionDays = Number(
      this.config.get('IMPORT_JOB_RETENTION_DAYS', 7),
    );
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
    await this.jobs.delete({
      status: In([
        AccountImportJobStatus.COMPLETED,
        AccountImportJobStatus.FAILED,
      ]),
      completedAt: LessThan(cutoff),
    });
  }
}
