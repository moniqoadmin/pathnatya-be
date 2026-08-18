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

@Entity('team_access')
@Unique('uq_team_access_account_team', ['accountId', 'teamNumber'])
@Index('idx_team_access_phone_system', ['phoneNumber', 'systemAddress'])
export class TeamAccess {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @ManyToOne(() => Account, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  account: Account;

  @Column({ name: 'phone_number', type: 'varchar', length: 20 })
  phoneNumber: string;

  @Column({ name: 'team_number', type: 'int' })
  teamNumber: number;

  @Column({ name: 'password_hash', type: 'varchar', nullable: true })
  passwordHash: string | null;

  @Column({ name: 'set_password', type: 'boolean', default: true })
  setPassword: boolean;

  @Column({ name: 'system_address', type: 'varchar', length: 255, nullable: true })
  systemAddress: string | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'is_login_disabled', type: 'boolean', default: false })
  isLoginDisabled: boolean;

  @Column({ name: 'last_login', type: 'timestamptz', nullable: true })
  lastLogin: Date | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 64, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'dom_security', type: 'boolean', default: false })
  domSecurity: boolean;

  @Column({ name: 'chokidar', type: 'boolean', default: false })
  chokidar: boolean;

  @Column({ name: 'video_only', type: 'boolean', default: false })
  videoOnly: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
