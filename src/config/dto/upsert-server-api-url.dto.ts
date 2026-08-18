import { IsIn, IsInt, IsUrl, MaxLength } from 'class-validator';

export class UpsertServerApiUrlDto {
  @IsInt()
  @IsIn([1, 2])
  id: number;

  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  link: string;
}
