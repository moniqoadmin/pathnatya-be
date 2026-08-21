import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { AccountsService, BulkUpdateFlagsError } from './accounts.service';
import { BulkUpdateFlagsDto } from './dto/bulk-update-flags.dto';
import { ListBulkFlagErrorsQueryDto } from './dto/list-bulk-flag-errors-query.dto';
import { ListBulkFlagJobsQueryDto } from './dto/list-bulk-flag-jobs-query.dto';
import { AccountRole } from './entities/account.entity';
import { BulkFlagJobError } from './entities/bulk-flag-job-error.entity';
import {
  BulkFlagJob,
  BulkFlagJobPayload,
  BulkFlagJobStatus,
} from './entities/bulk-flag-job.entity';

@Injectable()
export class BulkFlagsJobService {
  constructor(
    @InjectRepository(BulkFlagJob)
    private readonly jobs: Repository<BulkFlagJob>,
    @InjectRepository(BulkFlagJobError)
    private readonly errors: Repository<BulkFlagJobError>,
    private readonly accounts: AccountsService,
    private readonly config: ConfigService,
  ) {}

  async create(dto: BulkUpdateFlagsDto, requestedBy: string) {
    const flags = this.payloadFromDto(dto);
    const { reason: _reason, ...flagFields } = flags;
    void _reason;
    if (Object.keys(flagFields).length === 0) {
      throw new BadRequestException(
        'Provide at least one of: logoutButton, appConfiguration, numberOfReboot, isOffline, isLoginDisabled, setPassword',
      );
    }

    const active = await this.jobs.findOne({
      where: {
        status: In([BulkFlagJobStatus.QUEUED, BulkFlagJobStatus.PROCESSING]),
      },
    });
    if (active) {
      throw new ConflictException(
        'A bulk flags job is already queued or running',
      );
    }

    await this.cleanupOldJobs();
    return this.jobs.save(
      this.jobs.create({
        status: BulkFlagJobStatus.QUEUED,
        flags,
        requestedBy,
        usersChanged: 0,
        teamsChanged: 0,
        errorCount: 0,
        failureMessage: null,
        startedAt: null,
        completedAt: null,
      }),
    );
  }

  async markQueueFailure(jobId: string, message: string): Promise<void> {
    await this.jobs.update(jobId, {
      status: BulkFlagJobStatus.FAILED,
      failureMessage: message,
      completedAt: new Date(),
    });
  }

  async findAll(role: AccountRole, query: ListBulkFlagJobsQueryDto) {
    this.assertCanRead(role);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [data, total] = await this.jobs.findAndCount({
      where: query.status ? { status: query.status } : {},
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

  async findOne(id: string, role: AccountRole) {
    const job = await this.jobs.findOne({ where: { id } });
    if (!job) {
      throw new NotFoundException('Bulk flags job not found');
    }
    this.assertCanRead(role);
    return job;
  }

  async findErrors(
    id: string,
    role: AccountRole,
    query: ListBulkFlagErrorsQueryDto,
  ) {
    await this.findOne(id, role);
    const page = query.page ?? 1;
    const limit = query.limit ?? 100;
    const [data, total] = await this.errors.findAndCount({
      where: { jobId: id },
      order: { createdAt: 'ASC' },
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

  async process(id: string): Promise<void> {
    const claimed = await this.jobs
      .createQueryBuilder()
      .update(BulkFlagJob)
      .set({ status: BulkFlagJobStatus.PROCESSING, startedAt: new Date() })
      .where('id = :id AND status IN (:...statuses)', {
        id,
        statuses: [BulkFlagJobStatus.QUEUED, BulkFlagJobStatus.PROCESSING],
      })
      .execute();
    if (!claimed.affected) {
      return;
    }

    const job = await this.jobs.findOne({ where: { id } });
    if (!job?.requestedBy) {
      await this.fail(id, 'Job requester is no longer available');
      return;
    }

    try {
      let errorCount = 0;
      const result = await this.accounts.bulkUpdateFlags(
        job.requestedBy,
        { all: true, ...job.flags },
        async (progress) => {
          errorCount += progress.errors.length;
          await this.insertErrors(id, progress.errors);
          await this.jobs.update(id, {
            usersChanged: progress.usersChanged,
            teamsChanged: progress.teamsChanged,
            errorCount,
          });
        },
      );
      await this.jobs.update(id, {
        status: BulkFlagJobStatus.COMPLETED,
        usersChanged: result.usersChanged,
        teamsChanged: result.teamsChanged,
        errorCount,
        completedAt: new Date(),
      });
    } catch (error) {
      await this.fail(
        id,
        (error as Error).message || 'Bulk flags update failed',
      );
      throw error;
    }
  }

  private async insertErrors(
    jobId: string,
    errors: BulkUpdateFlagsError[],
  ): Promise<void> {
    if (errors.length === 0) {
      return;
    }
    for (let start = 0; start < errors.length; start += 500) {
      await this.errors.insert(
        errors.slice(start, start + 500).map((error) => ({
          jobId,
          phoneNumber: error.phoneNumber,
          kendra: error.kendra,
          sanghat: error.sanghat,
          teamNumber: error.teamNumber,
          fields: error.fields,
          error: error.error,
        })),
      );
    }
  }

  private payloadFromDto(dto: BulkUpdateFlagsDto): BulkFlagJobPayload {
    const flags: BulkFlagJobPayload = {};
    if (dto.logoutButton !== undefined) {
      flags.logoutButton = dto.logoutButton;
    }
    if (dto.appConfiguration !== undefined) {
      flags.appConfiguration = dto.appConfiguration;
    }
    if (dto.numberOfReboot !== undefined) {
      flags.numberOfReboot = dto.numberOfReboot;
    }
    if (dto.isOffline !== undefined) {
      flags.isOffline = dto.isOffline;
    }
    if (dto.isLoginDisabled !== undefined) {
      flags.isLoginDisabled = dto.isLoginDisabled;
    }
    if (dto.setPassword === true) {
      flags.setPassword = true;
    }
    if (dto.reason !== undefined) {
      flags.reason = dto.reason;
    }
    return flags;
  }

  private async fail(id: string, message: string): Promise<void> {
    await this.jobs.update(id, {
      status: BulkFlagJobStatus.FAILED,
      failureMessage: message,
      completedAt: new Date(),
    });
  }

  private assertCanRead(role: AccountRole): void {
    if (role !== AccountRole.SUPER_ADMIN && role !== AccountRole.DEVELOPER) {
      throw new ForbiddenException('You cannot access this bulk flags job');
    }
  }

  private async cleanupOldJobs(): Promise<void> {
    const retentionDays = Number(
      this.config.get('BULK_FLAGS_JOB_RETENTION_DAYS', 7),
    );
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
    await this.jobs.delete({
      status: In([BulkFlagJobStatus.COMPLETED, BulkFlagJobStatus.FAILED]),
      completedAt: LessThan(cutoff),
    });
  }
}
