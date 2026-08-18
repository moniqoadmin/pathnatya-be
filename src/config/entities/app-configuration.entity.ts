import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export interface VideoConfig {
  DEFAULT_HLS_SOURCE: string;
  ALLOWED_HOSTS: string[];
}

@Entity('app_configurations')
export class AppConfiguration {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ name: 'video_config', type: 'jsonb' })
  videoConfig: VideoConfig;

  @Column({ name: 'video_files', type: 'jsonb', default: () => "'[]'::jsonb" })
  videoFiles: Record<string, unknown>[];
}
