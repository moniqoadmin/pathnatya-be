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
import { FieldError, MergeErrorStatus } from '../excel-merge.types';
import { MergeTask } from './merge-task.entity';
import { MergeUploadedFile } from './uploaded-file.entity';

@Entity('task_errors')
export class MergeTaskError {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'task_id', type: 'uuid' })
  taskId: string;

  @ManyToOne(() => MergeTask, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task?: MergeTask;

  @Index()
  @Column({ name: 'file_id', type: 'uuid' })
  fileId: string;

  @ManyToOne(() => MergeUploadedFile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'file_id' })
  file?: MergeUploadedFile;

  @Column({ name: 'source_row_number', type: 'int' })
  sourceRowNumber: number;

  /** Original uploaded cells keyed by source header. Never overwritten. */
  @Column({ name: 'original_data', type: 'jsonb', default: () => "'{}'" })
  originalData: Record<string, unknown>;

  /** Current mapped values (after user edits). Keyed by master column key. */
  @Column({ name: 'mapped_data', type: 'jsonb', default: () => "'{}'" })
  mappedData: Record<string, unknown>;

  @Column({ name: 'field_errors', type: 'jsonb', default: () => "'[]'" })
  fieldErrors: FieldError[];

  @Index()
  @Column({ type: 'varchar', length: 32, default: MergeErrorStatus.PENDING })
  status: MergeErrorStatus;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
