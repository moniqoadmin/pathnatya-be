import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Account } from '../accounts/entities/account.entity';
import { CreateAuditTrailDto } from './dto/create-audit-trail.dto';
import { ListAuditTrailQueryDto } from './dto/list-audit-trail-query.dto';
import { AuditTrail } from './entities/audit-trail.entity';

export const USER_ENABLED_EVENT = 'USER_ENABLED';

export type AuditTrailResponse = {
  id: string;
  accountId: string;
  name: string | null;
  targetAccountId: string | null;
  kendra: string | null;
  event: string;
  message: string;
  createdAt: Date;
  metaData: Record<string, unknown> | null;
};

export type PaginatedAuditTrailResponse = {
  data: AuditTrailResponse[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

@Injectable()
export class AuditTrailService {
  constructor(
    @InjectRepository(AuditTrail)
    private readonly auditTrailRepository: Repository<AuditTrail>,
    @InjectRepository(Account)
    private readonly accountsRepository: Repository<Account>,
  ) {}

  async create(
    accountId: string,
    dto: CreateAuditTrailDto,
  ): Promise<AuditTrailResponse> {
    const entry = this.auditTrailRepository.create({
      accountId,
      targetAccountId: dto.targetAccountId ?? null,
      event: dto.event,
      message: dto.message,
      metaData: dto.metaData ?? null,
    });

    const saved = await this.auditTrailRepository.save(entry);
    const [response] = await this.toResponses([saved]);
    return response;
  }

  async findAll(
    query: ListAuditTrailQueryDto,
  ): Promise<PaginatedAuditTrailResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [entries, total] = await this.auditTrailRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: await this.toResponses(entries),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findOne(id: string): Promise<AuditTrailResponse> {
    const entry = await this.auditTrailRepository.findOne({ where: { id } });
    if (!entry) {
      throw new NotFoundException(`Audit trail ${id} not found`);
    }
    const [response] = await this.toResponses([entry]);
    return response;
  }

  private async toResponses(
    entries: AuditTrail[],
  ): Promise<AuditTrailResponse[]> {
    const ids = [
      ...new Set(
        entries.flatMap((entry) =>
          entry.targetAccountId
            ? [entry.accountId, entry.targetAccountId]
            : [entry.accountId],
        ),
      ),
    ];
    const accounts = ids.length
      ? await this.accountsRepository.find({
          where: { id: In(ids) },
          select: ['id', 'sanchalakName', 'kendra'],
        })
      : [];
    const byId = new Map(accounts.map((account) => [account.id, account]));

    return entries.map((entry) => {
      const actor = byId.get(entry.accountId);
      const target = entry.targetAccountId
        ? byId.get(entry.targetAccountId)
        : undefined;
      return {
        id: entry.id,
        accountId: entry.accountId,
        name: actor?.sanchalakName ?? null,
        targetAccountId: entry.targetAccountId,
        kendra: target?.kendra ?? null,
        event: entry.event,
        message: entry.message,
        createdAt: entry.createdAt,
        metaData: entry.metaData,
      };
    });
  }
}
