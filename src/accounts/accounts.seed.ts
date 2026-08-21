import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { DEFAULT_SUPER_USER } from './accounts.constants';
import { Account } from './entities/account.entity';

const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class AccountsSeedService implements OnModuleInit {
  constructor(
    @InjectRepository(Account)
    private readonly accountsRepository: Repository<Account>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultSuperUser();
  }

  async seedDefaultSuperUser(): Promise<void> {
    const existing = await this.accountsRepository.findOne({
      where: { phoneNumber: DEFAULT_SUPER_USER.phoneNumber },
      select: ['id'],
    });
    if (existing) {
      return;
    }

    try {
      await this.accountsRepository.save(
        this.accountsRepository.create({
          ...DEFAULT_SUPER_USER,
          metadata: { ...DEFAULT_SUPER_USER.metadata },
        }),
      );
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      typeof error.driverError === 'object' &&
      error.driverError !== null &&
      'code' in error.driverError &&
      error.driverError.code === PG_UNIQUE_VIOLATION
    );
  }
}
