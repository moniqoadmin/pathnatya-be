import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum IssueStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export type IssueComment = {
  accountId: string;
  phoneNumber: string;
  message: string;
  createdAt: string;
};

@Entity('issues')
export class Issue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'phone_number', length: 20 })
  phoneNumber: string;

  @Index()
  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  // Account id of the user who filed the issue (from the auth token).
  @Column({ name: 'reported_by', type: 'uuid' })
  reportedBy: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ name: 'issue_numbers', type: 'int', array: true })
  issueNumbers: number[];

  @Index()
  @Column({
    type: 'enum',
    enum: IssueStatus,
    default: IssueStatus.OPEN,
  })
  status: IssueStatus;

  @Column({ type: 'text', nullable: true })
  resolution: string | null;

  @Column({ name: 'resolution_message', type: 'text', nullable: true })
  resolutionMessage: string | null;

  @Column({ name: 'comments', type: 'jsonb', default: () => "'[]'" })
  comments: IssueComment[];

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
