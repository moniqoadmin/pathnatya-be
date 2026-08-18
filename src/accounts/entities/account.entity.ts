import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Team } from './team.entity';

export enum AccountStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

export enum AccountRole {
  USER = 'User',
  ADMIN = 'Admin',
  SUPER_ADMIN = 'SuperAdmin',
  DEVELOPER = 'Developer',
}

@Entity('accounts')
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 10-digit US/UK/India phone number, stored without country code or
  // extension (e.g. 9876543210). phoneNumber is immutable once created.
  @Column({ name: 'phone_number', unique: true, length: 20, update: false })
  phoneNumber: string;

  @Column({ name: 'is_offline', type: 'boolean', default: false })
  isOffline: boolean;

  // When true, the account is blocked from authenticating: check-phone,
  // login and set-password all reject regardless of credentials.
  @Column({ name: 'is_login_disabled', type: 'boolean', default: false })
  isLoginDisabled: boolean;

  // When true, the client should enforce DOM security checks for this account.
  @Column({ name: 'dom_security', type: 'boolean', default: false })
  domSecurity: boolean;

  // When true, the client should enable chokidar filesystem watching.
  @Column({ name: 'chokidar', type: 'boolean', default: false })
  chokidar: boolean;

  @Column({
    type: 'enum',
    enum: AccountStatus,
    default: AccountStatus.ACTIVE,
  })
  status: AccountStatus;

  @Column({
    type: 'enum',
    enum: AccountRole,
    default: AccountRole.USER,
  })
  role: AccountRole;

  @Column({ type: 'varchar', length: 120, nullable: true })
  country: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  sanghat: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  jilha: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  taluka: string | null;

  @Column({ name: 'group', type: 'varchar', length: 120, nullable: true })
  group: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  kendra: string | null;

  @Column({
    name: 'sanchalak_name',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  sanchalakName: string | null;

  // Max number of team rows allowed for this account. Null is treated as 1.
  @Column({ name: 'number_of_teams', type: 'int', nullable: true })
  numberOfTeams: number | null;

  @Column({ name: 'number_of_reboot', type: 'int', default: 0 })
  numberOfReboot: number;

  // When true, the client should play video only (no other media).
  @Column({ name: 'video_only', type: 'boolean', default: false })
  videoOnly: boolean;

  // ID of the app_configurations row assigned to this account.
  @Column({ name: 'app_configuration', type: 'int', default: 1 })
  appConfiguration: number;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @OneToMany(() => Team, (team) => team.account, { cascade: true })
  teams: Team[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
