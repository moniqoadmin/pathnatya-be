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

@Entity('accounts')
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 10-digit US/UK/India phone number, stored without country code or
  // extension (e.g. 9876543210). phoneNumber is immutable once created.
  @Column({ name: 'phone_number', unique: true, length: 20, update: false })
  phoneNumber: string;

  // Nullable: an account can be created with only a phone number and no
  // password yet (see setPassword).
  @Column({ name: 'password_hash', type: 'varchar', nullable: true })
  passwordHash: string | null;

  // true  -> a password still needs to be set (created with phone number only)
  // false -> a password has been set
  @Column({ name: 'set_password', type: 'boolean', default: true })
  setPassword: boolean;

  @Column({
    type: 'enum',
    enum: AccountStatus,
    default: AccountStatus.ACTIVE,
  })
  status: AccountStatus;

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

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'last_login_time', type: 'timestamptz', nullable: true })
  lastLoginTime: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
