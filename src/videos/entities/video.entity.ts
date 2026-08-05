import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { VideoSegment } from './video-segment.entity';

@Entity('videos')
export class Video {
  @PrimaryColumn({ name: 'video_id', type: 'varchar', length: 120 })
  videoId: string;

  @Column({ type: 'varchar', length: 512 })
  source: string;

  @Column({ name: 'source_bytes', type: 'bigint' })
  sourceBytes: string;

  @Column({ name: 'segment_duration_seconds', type: 'double precision' })
  segmentDurationSeconds: number;

  @Column({ name: 'segment_count', type: 'int' })
  segmentCount: number;

  @Column({ name: 'total_duration_seconds', type: 'double precision' })
  totalDurationSeconds: number;

  @Column({ type: 'varchar', length: 64 })
  algorithm: string;

  @Column({ type: 'varchar', length: 64 })
  header: string;

  @Column({ name: 'key_derivation', type: 'varchar', length: 128 })
  keyDerivation: string;

  @Column({ name: 'local_dir', type: 'varchar', length: 512 })
  localDir: string;

  @OneToMany(() => VideoSegment, (segment) => segment.video)
  segments: VideoSegment[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
