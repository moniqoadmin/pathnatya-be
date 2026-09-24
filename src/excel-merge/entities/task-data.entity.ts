import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MergeTask } from './merge-task.entity';
import { MergeUploadedFile } from './uploaded-file.entity';

@Entity('task_data')
export class MergeTaskData {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'task_id', type: 'uuid' })
  taskId: string;

  @ManyToOne(() => MergeTask, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task?: MergeTask;

  /** Null when the row was added directly to the merged data. */
  @Index()
  @Column({ name: 'file_id', type: 'uuid', nullable: true })
  fileId: string | null;

  @ManyToOne(() => MergeUploadedFile, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'file_id' })
  file?: MergeUploadedFile | null;

  /** Null when the row was added directly and did not come from an Excel row. */
  @Column({ name: 'source_row_number', type: 'int', nullable: true })
  sourceRowNumber: number | null;

  /** Values keyed by output column key. Missing keys are blank in export. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  data: Record<string, unknown>;

  /** Original uploaded cells keyed by source header. Never overwritten. */
  @Column({ name: 'original_data', type: 'jsonb', default: () => "'{}'" })
  originalData: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
