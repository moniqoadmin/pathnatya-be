import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('app_configurations')
export class AppConfiguration {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ name: 'video_config', type: 'jsonb' })
  videoConfig: unknown;

  @Column({ name: 'video_files', type: 'jsonb', default: () => "'[]'::jsonb" })
  videoFiles: unknown;
}
