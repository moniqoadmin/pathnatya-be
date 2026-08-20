import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { authorizeViewAccount } from '../accounts/account-authorization';
import { AccountsService } from '../accounts/accounts.service';
import { CreateLogDto } from './dto/create-log.dto';
import { ListLogsQueryDto } from './dto/list-logs-query.dto';
import { Log } from './entities/log.entity';

export const FILES_TAMPERED_EVENT = 'FILES_TAMPERED';

export type LogResponse = {
  logId: string;
  id: string;
  phoneNumber: string;
  event: string;
  tampered: boolean;
  ipAddress: string | null;
  teamNumber: number | null;
  meta: Record<string, unknown> | null;
  createdAt: Date;
};

export type PaginatedLogsResponse = {
  data: LogResponse[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

@Injectable()
export class LogsService {
  constructor(
    @InjectRepository(Log)
    private readonly logsRepository: Repository<Log>,
    private readonly accountsService: AccountsService,
  ) {}

  async create(accountId: string, dto: CreateLogDto): Promise<LogResponse> {
    const account = await this.accountsService.findOne(accountId);
    const ipAddress = dto.ipAddress?.trim() || null;

    if (dto.event === FILES_TAMPERED_EVENT) {
      if (!ipAddress) {
        throw new BadRequestException(
          'ipAddress (MAC) is required for FILES_TAMPERED',
        );
      }
      await this.accountsService.disableTeamLoginByAddress(
        account.id,
        ipAddress,
      );
    }

    const log = this.logsRepository.create({
      id: account.id,
      phoneNumber: account.phoneNumber,
      event: dto.event,
      tampered: dto.tampered ?? false,
      ipAddress,
      meta: dto.metadata ?? dto.meta ?? null,
    });

    const saved = await this.logsRepository.save(log);
    return this.toResponse(saved, account.teams);
  }

  async findAllForAccount(accountId: string): Promise<LogResponse[]> {
    const account = await this.accountsService.findOne(accountId);
    const logs = await this.logsRepository.find({
      where: { id: account.id },
      order: { createdAt: 'DESC' },
    });
    return logs.map((log) => this.toResponse(log, account.teams));
  }

  async findAllForAccountId(
    callerId: string,
    accountId: string,
    query: ListLogsQueryDto,
  ): Promise<PaginatedLogsResponse> {
    const caller = await this.accountsService.findOne(callerId);
    const account = await this.accountsService.findOne(accountId);
    authorizeViewAccount(caller, account);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [logs, total] = await this.logsRepository.findAndCount({
      where: { id: account.id },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: logs.map((log) => this.toResponse(log, account.teams)),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findOne(logId: string, accountId: string): Promise<LogResponse> {
    const account = await this.accountsService.findOne(accountId);
    const log = await this.logsRepository.findOne({
      where: { logId, id: account.id },
    });
    if (!log) {
      throw new NotFoundException(`Log with logId ${logId} not found`);
    }
    return this.toResponse(log, account.teams);
  }

  private toResponse(
    log: Log,
    teams: { teamNumber: number; systemAddress: string | null }[],
  ): LogResponse {
    return {
      logId: log.logId,
      id: log.id,
      phoneNumber: log.phoneNumber,
      event: log.event,
      tampered: log.tampered,
      ipAddress: log.ipAddress,
      teamNumber: this.teamNumberForIp(teams, log.ipAddress),
      meta: log.meta,
      createdAt: log.createdAt,
    };
  }

  private teamNumberForIp(
    teams: { teamNumber: number; systemAddress: string | null }[],
    ipAddress: string | null,
  ): number | null {
    if (!ipAddress) {
      return null;
    }
    const normalized = ipAddress.trim().toLowerCase();
    const team = teams.find(
      (item) => item.systemAddress?.trim().toLowerCase() === normalized,
    );
    return team?.teamNumber ?? null;
  }
}
