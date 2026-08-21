import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Account } from './account.entity';

export enum BulkFlagJobStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export type BulkFlagJobPayload = {
  logoutButton?: boolean;
  appConfiguration?: number;
  numberOfReboot?: number;
  isOffline?: boolean;
  isLoginDisabled?: boolean;
  setPassword?: boolean;
  reason?: string;
};

@Entity('bulk_flag_jobs')
export class BulkFlagJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: BulkFlagJobStatus })
  status: BulkFlagJobStatus;

  @Column({ type: 'jsonb' })
  flags: BulkFlagJobPayload;

  @Column({ name: 'users_changed', type: 'int', default: 0 })
  usersChanged: number;

  @Column({ name: 'teams_changed', type: 'int', default: 0 })
  teamsChanged: number;

  @Column({ name: 'error_count', type: 'int', default: 0 })
  errorCount: number;

  @Column({ name: 'failure_message', type: 'text', nullable: true })
  failureMessage: string | null;

  @Column({ name: 'requested_by', type: 'uuid', nullable: true })
  requestedBy: string | null;

  @ManyToOne(() => Account, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'requested_by' })
  requester?: Account | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
