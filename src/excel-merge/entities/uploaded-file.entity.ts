import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  ExcelAnalysis,
  FileColumnMapping,
  MergeFileStatus,
} from '../excel-merge.types';
import { MergeTask } from './merge-task.entity';

@Entity('uploaded_files')
export class MergeUploadedFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'task_id', type: 'uuid' })
  taskId: string;

  @ManyToOne(() => MergeTask, (task) => task.files, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task?: MergeTask;

  @Column({ name: 'file_name', length: 255 })
  fileName: string;

  @Column({ name: 'file_size', type: 'int' })
  fileSize: number;

  @Column({ name: 'file_data', type: 'bytea', nullable: true, select: false })
  fileData: Buffer | null;

  @Column({ type: 'varchar', length: 32, default: MergeFileStatus.UPLOADED })
  status: MergeFileStatus;

  @Column({ type: 'jsonb', nullable: true })
  analysis: ExcelAnalysis | null;

  @Column({ name: 'column_mapping', type: 'jsonb', nullable: true })
  columnMapping: FileColumnMapping[] | null;

  @Column({
    name: 'selected_sheet',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  selectedSheet: string | null;

  @Column({ name: 'header_row', type: 'int', nullable: true })
  headerRow: number | null;

  @Column({ name: 'total_rows', type: 'int', default: 0 })
  totalRows: number;

  @Column({ name: 'valid_count', type: 'int', default: 0 })
  validCount: number;

  @Column({ name: 'error_count', type: 'int', default: 0 })
  errorCount: number;

  @Column({ name: 'failure_message', type: 'text', nullable: true })
  failureMessage: string | null;

  @Column({ name: 'uploaded_by', type: 'uuid' })
  uploadedBy: string;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
