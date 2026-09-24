import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { TaskColumnDataType } from '../excel-merge.types';
import { MergeTask } from './merge-task.entity';

@Entity('task_columns')
@Unique(['taskId', 'key'])
export class MergeTaskColumn {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'task_id', type: 'uuid' })
  taskId: string;

  @ManyToOne(() => MergeTask, (task) => task.columns, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task?: MergeTask;

  /** Stable JSONB key used in task_data / task_errors, e.g. mobile_number. */
  @Column({ length: 80 })
  key: string;

  @Column({ length: 255 })
  label: string;

  @Column({ name: 'data_type', type: 'varchar', length: 32 })
  dataType: TaskColumnDataType;

  @Column({ type: 'boolean', default: false })
  required: boolean;

  /** Identity column for this task. At most one column is primary. */
  @Column({ type: 'boolean', default: false })
  primary: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
