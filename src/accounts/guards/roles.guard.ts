import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { Repository } from 'typeorm';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Account, AccountRole } from '../entities/account.entity';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(Account)
    private readonly accountsRepository: Repository<Account>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<AccountRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const accountId = request.user?.sub;
    if (!accountId) {
      throw new UnauthorizedException('Missing or invalid authorization token');
    }

    const account = await this.accountsRepository.findOne({
      where: { id: accountId },
      select: ['id', 'role'],
    });
    if (!account) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    if (!requiredRoles.includes(account.role)) {
      throw new ForbiddenException('Your account cannot perform this action');
    }

    return true;
  }
}
