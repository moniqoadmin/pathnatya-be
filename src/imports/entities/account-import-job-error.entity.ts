import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AccountImportJob } from './account-import-job.entity';

@Entity('account_import_job_errors')
@Index('idx_account_import_job_errors_job_row', ['jobId', 'rowNumber'])
export class AccountImportJobError {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'job_id', type: 'uuid' })
  jobId: string;

  @ManyToOne(() => AccountImportJob, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_id' })
  job: AccountImportJob;

  @Column({ name: 'row_number', type: 'int' })
  rowNumber: number;

  @Column({ type: 'varchar', nullable: true })
  sn: string | null;

  @Column({ type: 'varchar', nullable: true })
  country: string | null;

  @Column({ type: 'varchar', nullable: true })
  sanghat: string | null;

  @Column({ type: 'varchar', nullable: true })
  jilha: string | null;

  @Column({ type: 'varchar', nullable: true })
  taluka: string | null;

  @Column({ name: 'group', type: 'varchar', nullable: true })
  group: string | null;

  @Column({ type: 'varchar', nullable: true })
  kendra: string | null;

  @Column({ name: 'sanchalak_name', type: 'varchar', nullable: true })
  sanchalakName: string | null;

  @Column({ name: 'phone_number', type: 'varchar', nullable: true })
  phoneNumber: string | null;

  @Column({ type: 'text' })
  error: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
