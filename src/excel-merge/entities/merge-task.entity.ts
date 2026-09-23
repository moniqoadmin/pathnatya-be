import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SavedColumnMapping } from '../excel-merge.types';
import { MergeTaskColumn } from './task-column.entity';
import { MergeUploadedFile } from './uploaded-file.entity';

@Entity('merge_tasks')
export class MergeTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  /**
   * Task-level learned mappings, keyed by normalized source header.
   * Reused automatically when a later file has the same column name.
   */
  @Column({
    name: 'column_mappings',
    type: 'jsonb',
    default: () => "'{}'",
  })
  columnMappings: Record<string, SavedColumnMapping>;

  /**
   * Column names locked from the first successfully analyzed Excel file.
   * Later uploads may not introduce any new names.
   */
  @Column({
    name: 'frozen_headers',
    type: 'jsonb',
    default: () => "'[]'",
  })
  frozenHeaders: string[];

  @OneToMany(() => MergeTaskColumn, (column) => column.task)
  columns?: MergeTaskColumn[];

  @OneToMany(() => MergeUploadedFile, (file) => file.task)
  files?: MergeUploadedFile[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
