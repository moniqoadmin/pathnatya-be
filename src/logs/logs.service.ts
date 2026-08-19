import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountsService } from '../accounts/accounts.service';
import { CreateLogDto } from './dto/create-log.dto';
import { Log } from './entities/log.entity';

export const FILES_TAMPERED_EVENT = 'FILES_TAMPERED';

export type LogResponse = {
  logId: string;
  id: string;
  phoneNumber: string;
  event: string;
  tampered: boolean;
  ipAddress: string | null;
  meta: Record<string, unknown> | null;
  createdAt: Date;
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
    return this.toResponse(saved);
  }

  async findAllForAccount(accountId: string): Promise<LogResponse[]> {
    const logs = await this.logsRepository.find({
      where: { id: accountId },
      order: { createdAt: 'DESC' },
    });
    return logs.map((log) => this.toResponse(log));
  }

  async findOne(logId: string, accountId: string): Promise<LogResponse> {
    const log = await this.logsRepository.findOne({
      where: { logId, id: accountId },
    });
    if (!log) {
      throw new NotFoundException(`Log with logId ${logId} not found`);
    }
    return this.toResponse(log);
  }

  private toResponse(log: Log): LogResponse {
    return {
      logId: log.logId,
      id: log.id,
      phoneNumber: log.phoneNumber,
      event: log.event,
      tampered: log.tampered,
      ipAddress: log.ipAddress,
      meta: log.meta,
      createdAt: log.createdAt,
    };
  }
}
