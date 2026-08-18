import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Account } from './account.entity';

@Entity('teams')
@Unique('uq_teams_account_team_number', ['accountId', 'teamNumber'])
export class Team {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @ManyToOne(() => Account, (account) => account.teams, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  account: Account;

  // 1-based index unique per account. Team 1 is created with the account.
  @Column({ name: 'team_number', type: 'int' })
  teamNumber: number;

  @Column({ name: 'password_hash', type: 'varchar', nullable: true })
  passwordHash: string | null;

  // true  -> this team still needs to set a password
  // false -> a password has been set
  @Column({ name: 'set_password', type: 'boolean', default: true })
  setPassword: boolean;

  // Bound device / IP for this team. Null until set-password (or login
  // when the account allows 2+ teams).
  @Column({
    name: 'system_address',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  systemAddress: string | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'is_login_disabled', type: 'boolean', default: false })
  isLoginDisabled: boolean;

  @Column({ name: 'last_login_time', type: 'timestamptz', nullable: true })
  lastLoginTime: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
