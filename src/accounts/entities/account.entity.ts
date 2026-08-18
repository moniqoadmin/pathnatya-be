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

  @Column({ name: 'number_of_teams', type: 'int', nullable: true })
  numberOfTeams: number | null;

  @Column({ name: 'number_of_reboot', type: 'int', default: 0 })
  numberOfReboot: number;

  @Column({ name: 'app_configuration', type: 'int', default: 1 })
  appConfiguration: number;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
