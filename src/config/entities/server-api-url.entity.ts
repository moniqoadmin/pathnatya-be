import { Check, Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('server_api_urls')
@Check('CHK_server_api_urls_id', '"id" IN (1, 2)')
export class ServerApiUrl {
  @PrimaryColumn({ type: 'int' })
  id: number;

  @Column({ type: 'varchar', length: 2048 })
  link: string;
}
