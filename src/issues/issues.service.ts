import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsOrder, FindOptionsWhere, Repository } from 'typeorm';
import { AccountsService } from '../accounts/accounts.service';
import { AccountRole } from '../accounts/entities/account.entity';
import { AddIssueCommentDto } from './dto/add-issue-comment.dto';
import { CreateIssueDto } from './dto/create-issue.dto';
import { ListIssuesQueryDto } from './dto/list-issues-query.dto';
import { ResolveIssueDto } from './dto/resolve-issue.dto';
import { UpdateIssueStatusDto } from './dto/update-issue-status.dto';
import {
  Issue,
  IssueComment,
  IssueStatus,
} from './entities/issue.entity';

export type IssueResponse = {
  id: string;
  phoneNumber: string;
  accountId: string;
  reportedBy: string;
  message: string;
  issueNumbers: number[];
  status: IssueStatus;
  resolution: string | null;
  resolutionMessage: string | null;
  comments: IssueComment[];
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PaginatedIssuesResponse = {
  data: IssueResponse[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const RESOLVER_ROLES = new Set<AccountRole>([
  AccountRole.SUPER_ADMIN,
  AccountRole.DEVELOPER,
]);

@Injectable()
export class IssuesService {
  constructor(
    @InjectRepository(Issue)
    private readonly issuesRepository: Repository<Issue>,
    private readonly accountsService: AccountsService,
  ) {}

  async create(
    callerId: string,
    dto: CreateIssueDto,
  ): Promise<IssueResponse> {
    const caller = await this.accountsService.findOne(callerId);
    const subject = await this.accountsService.findByPhoneNumber(
      dto.phoneNumber,
    );
    this.assertCanReportFor(caller, subject);

    const issue = this.issuesRepository.create({
      phoneNumber: subject.phoneNumber,
      accountId: subject.id,
      reportedBy: caller.id,
      message: dto.message,
      issueNumbers: dto.issueNumbers ?? [],
      status: IssueStatus.OPEN,
      comments: [],
    });

    const saved = await this.issuesRepository.save(issue);
    return this.toResponse(saved);
  }

  async findMine(
    callerId: string,
    query: ListIssuesQueryDto,
  ): Promise<PaginatedIssuesResponse> {
    return this.paginate(
      { reportedBy: callerId },
      query,
      { createdAt: 'DESC' },
    );
  }

  async findPending(
    callerId: string,
    query: ListIssuesQueryDto,
  ): Promise<PaginatedIssuesResponse> {
    await this.assertResolver(callerId);
    const where: FindOptionsWhere<Issue> = query.status
      ? { status: query.status }
      : {};
    const order: FindOptionsOrder<Issue> =
      query.status === IssueStatus.RESOLVED ||
      query.status === IssueStatus.CLOSED ||
      !query.status
        ? { createdAt: 'DESC' }
        : { createdAt: 'ASC' };
    return this.paginate(where, query, order);
  }

  async findOne(id: string, callerId: string): Promise<IssueResponse> {
    const issue = await this.getEntityOrFail(id);
    await this.assertCanView(callerId, issue);
    return this.toResponse(issue);
  }

  async addComment(
    id: string,
    callerId: string,
    dto: AddIssueCommentDto,
  ): Promise<IssueResponse> {
    const issue = await this.getEntityOrFail(id);
    const caller = await this.accountsService.findOne(callerId);
    this.assertCanComment(caller.role, caller.id, issue);

    const comment: IssueComment = {
      accountId: caller.id,
      phoneNumber: caller.phoneNumber,
      message: dto.message,
      createdAt: new Date().toISOString(),
    };

    issue.comments = [...(issue.comments ?? []), comment];
    const saved = await this.issuesRepository.save(issue);
    return this.toResponse(saved);
  }

  async updateStatus(
    id: string,
    callerId: string,
    dto: UpdateIssueStatusDto,
  ): Promise<IssueResponse> {
    await this.assertResolver(callerId);
    const issue = await this.getEntityOrFail(id);

    if (issue.status === dto.status) {
      return this.toResponse(issue);
    }

    issue.status = dto.status;
    const saved = await this.issuesRepository.save(issue);
    return this.toResponse(saved);
  }

  async resolve(
    id: string,
    callerId: string,
    dto: ResolveIssueDto,
  ): Promise<IssueResponse> {
    await this.assertResolver(callerId);
    const issue = await this.getEntityOrFail(id);

    const nextStatus = dto.status ?? IssueStatus.RESOLVED;
    if (
      nextStatus !== IssueStatus.RESOLVED &&
      nextStatus !== IssueStatus.CLOSED
    ) {
      throw new BadRequestException(
        'status must be resolved or closed when resolving an issue',
      );
    }

    issue.resolution = dto.resolution;
    issue.resolutionMessage = dto.resolutionMessage;
    issue.status = nextStatus;
    issue.resolvedBy = callerId;
    issue.resolvedAt = new Date();

    const saved = await this.issuesRepository.save(issue);
    return this.toResponse(saved);
  }

  private async paginate(
    where: FindOptionsWhere<Issue>,
    query: ListIssuesQueryDto,
    order: FindOptionsOrder<Issue>,
  ): Promise<PaginatedIssuesResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [issues, total] = await this.issuesRepository.findAndCount({
      where,
      order,
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: issues.map((issue) => this.toResponse(issue)),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  private async getEntityOrFail(id: string): Promise<Issue> {
    const issue = await this.issuesRepository.findOne({ where: { id } });
    if (!issue) {
      throw new NotFoundException(`Issue with id ${id} not found`);
    }
    return issue;
  }

  private assertCanReportFor(
    caller: { id: string; role: AccountRole; sanghat: string | null },
    subject: { id: string; role: AccountRole; sanghat: string | null },
  ): void {
    if (caller.id === subject.id) {
      return;
    }

    if (caller.role === AccountRole.ADMIN) {
      if (subject.role !== AccountRole.USER) {
        throw new ForbiddenException('Admins can only report issues for Users');
      }
      if (!caller.sanghat) {
        throw new ForbiddenException('Admin account has no sanghat assigned');
      }
      if (
        !subject.sanghat ||
        subject.sanghat.toLowerCase() !== caller.sanghat.toLowerCase()
      ) {
        throw new ForbiddenException(
          'Admins can only report issues for Users in their sanghat',
        );
      }
      return;
    }

    if (RESOLVER_ROLES.has(caller.role)) {
      return;
    }

    throw new ForbiddenException(
      'You can only report issues for your own phone number',
    );
  }

  private async assertResolver(callerId: string): Promise<void> {
    const caller = await this.accountsService.findOne(callerId);
    if (!RESOLVER_ROLES.has(caller.role)) {
      throw new ForbiddenException(
        'Only SuperAdmin and Developer can resolve issues',
      );
    }
  }

  private async assertCanView(
    callerId: string,
    issue: Issue,
  ): Promise<void> {
    if (issue.accountId === callerId) {
      return;
    }
    const caller = await this.accountsService.findOne(callerId);
    if (RESOLVER_ROLES.has(caller.role)) {
      return;
    }
    throw new ForbiddenException('You can only view your own issues');
  }

  private assertCanComment(
    role: AccountRole,
    callerId: string,
    issue: Issue,
  ): void {
    if (issue.accountId === callerId || RESOLVER_ROLES.has(role)) {
      return;
    }
    throw new ForbiddenException(
      'You can only comment on your own issues',
    );
  }

  private toResponse(issue: Issue): IssueResponse {
    return {
      id: issue.id,
      phoneNumber: issue.phoneNumber,
      accountId: issue.accountId,
      reportedBy: issue.reportedBy,
      message: issue.message,
      issueNumbers: issue.issueNumbers,
      status: issue.status,
      resolution: issue.resolution,
      resolutionMessage: issue.resolutionMessage,
      comments: issue.comments ?? [],
      resolvedBy: issue.resolvedBy,
      resolvedAt: issue.resolvedAt,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    };
  }
}
