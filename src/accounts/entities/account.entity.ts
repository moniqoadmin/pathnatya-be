import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

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

  @Column({ name: 'phone_number', unique: true, length: 20, update: false })
  phoneNumber: string;

  @Column({ name: 'is_offline', type: 'boolean', default: false })
  isOffline: boolean;

  @Column({ name: 'is_login_disabled', type: 'boolean', default: false })
  isLoginDisabled: boolean;

  @Column({ name: 'dom_security', type: 'boolean', default: false })
  domSecurity: boolean;

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

  @Column({ name: 'sanchalak_name', type: 'varchar', length: 120, nullable: true })
  sanchalakName: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 64, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'number_of_teams', type: 'int', nullable: true })
  numberOfTeams: number | null;

  @Column({ name: 'number_of_reboot', type: 'int', default: 0 })
  numberOfReboot: number;

  @Column({ name: 'video_only', type: 'boolean', default: false })
  videoOnly: boolean;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'last_login_time', type: 'timestamptz', nullable: true })
  lastLoginTime: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
