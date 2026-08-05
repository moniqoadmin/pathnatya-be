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
import { Video } from './video.entity';

export type PartOrders = {
  local: number;
  remote: number;
};

@Entity('video_segments')
@Unique('uq_video_segments_video_segment', ['videoId', 'segmentNumber'])
@Index('idx_video_segments_video_id', ['videoId'])
export class VideoSegment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'video_id', type: 'varchar', length: 120 })
  videoId: string;

  @ManyToOne(() => Video, (video) => video.segments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'video_id' })
  video: Video;

  @Column({ name: 'segment_number', type: 'int' })
  segmentNumber: number;

  @Column({ name: 'language_name', type: 'varchar', length: 32 })
  languageName: string;

  @Column({ name: 'start_time', type: 'double precision' })
  startTime: number;

  @Column({ name: 'duration_seconds', type: 'double precision' })
  durationSeconds: number;

  @Column({ name: 'encrypted_bytes', type: 'bigint' })
  encryptedBytes: string;

  @Column({ name: 'local_bytes', type: 'bigint' })
  localBytes: string;

  @Column({ name: 'remote_bytes', type: 'bigint' })
  remoteBytes: string;

  @Column({ name: 'split_at', type: 'bigint' })
  splitAt: string;

  @Column({ name: 'local_ratio', type: 'double precision' })
  localRatio: number;

  @Column({ name: 'remote_ratio', type: 'double precision' })
  remoteRatio: number;

  @Column({ name: 'local_file', type: 'varchar', length: 512 })
  localFile: string;

  @Column({ type: 'varchar', length: 128 })
  hash: string;

  @Column({ name: 'part_orders', type: 'jsonb' })
  partOrders: PartOrders;

  /** Base64-encoded remote payload (can be several MB). */
  @Column({ name: 'remote_data', type: 'text' })
  remoteData: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
