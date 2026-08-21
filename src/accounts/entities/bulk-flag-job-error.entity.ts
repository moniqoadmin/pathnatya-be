import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BulkFlagJob } from './bulk-flag-job.entity';

@Entity('bulk_flag_job_errors')
@Index('idx_bulk_flag_job_errors_job', ['jobId'])
export class BulkFlagJobError {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'job_id', type: 'uuid' })
  jobId: string;

  @ManyToOne(() => BulkFlagJob, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_id' })
  job: BulkFlagJob;

  @Column({ name: 'phone_number', type: 'varchar', nullable: true })
  phoneNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  kendra: string | null;

  @Column({ type: 'varchar', nullable: true })
  sanghat: string | null;

  @Column({ name: 'team_number', type: 'int', nullable: true })
  teamNumber: number | null;

  @Column({ type: 'jsonb' })
  fields: string[];

  @Column({ type: 'text' })
  error: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
