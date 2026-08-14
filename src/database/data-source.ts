import 'dotenv/config';
import { DataSource } from 'typeorm';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

export default new DataSource({
  type: 'postgres',
  url,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: [`${__dirname}/../**/*.entity.{js,ts}`],
  migrations: [`${__dirname}/migrations/*.{js,ts}`],
  synchronize: false,
});
