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

  @Index()
  @Column({ name: 'file_id', type: 'uuid' })
  fileId: string;

  @ManyToOne(() => MergeUploadedFile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'file_id' })
  file?: MergeUploadedFile;

  @Column({ name: 'source_row_number', type: 'int' })
  sourceRowNumber: number;

  /** Values keyed by master column key, ready for export. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  data: Record<string, unknown>;

  /** Original uploaded cells keyed by source header. Never overwritten. */
  @Column({ name: 'original_data', type: 'jsonb', default: () => "'{}'" })
  originalData: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
