import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('logs')
export class Log {
  @PrimaryGeneratedColumn('uuid')
  logId: string;

  // Same UUID as accounts.id — taken from the auth token on create.
  @Index()
  @Column({ name: 'id', type: 'uuid' })
  id: string;

  @Column({ name: 'phone_number', length: 20 })
  phoneNumber: string;

  @Column({ type: 'varchar', length: 255 })
  event: string;

  @Column({ type: 'boolean', default: false })
  tampered: boolean;

  // Device MAC (request field name: ipAddress). Stored for FILES_TAMPERED
  // so the matching team can be disabled without locking the whole account.
  @Column({ name: 'ip_address', type: 'varchar', length: 64, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'meta', type: 'jsonb', nullable: true })
  meta: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
