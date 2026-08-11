import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('logs')
export class Log {
  @PrimaryGeneratedColumn('uuid')
  logId: string;

  // Same UUID as accounts.id — taken from the auth token on create.
  @Index()
  @Column({ name: 'id', type: 'uuid' })
  id: string;

  @Column({ name: 'phone_number', length: 20 })
  phoneNumber: string;

  @Column({ type: 'varchar', length: 255 })
  event: string;

  @Column({ type: 'boolean', default: false })
  tampered: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
