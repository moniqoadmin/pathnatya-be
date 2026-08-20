import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('audit_trail')
export class AuditTrail {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Index()
  @Column({ name: 'target_account_id', type: 'uuid', nullable: true })
  targetAccountId: string | null;

  @Column({ type: 'varchar', length: 255 })
  event: string;

  @Column({ type: 'text' })
  message: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metaData: Record<string, unknown> | null;
}
