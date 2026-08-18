import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateTeamDto {
  @ApiProperty({ example: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  teamNumber: number;

  @ApiPropertyOptional({
    example: true,
    description:
      'When true, this team must set a password again (password hash is cleared). Admins may only change this from false to true.',
  })
  @IsOptional()
  @IsBoolean()
  setPassword?: boolean;

  @ApiPropertyOptional({
    example: false,
    description: 'When true, this team cannot authenticate.',
  })
  @IsOptional()
  @IsBoolean()
  isLoginDisabled?: boolean;

  @ApiPropertyOptional({
    example: 'S3curePass!',
    minLength: 6,
    description: 'Optional. Sets this team password and setPassword to false.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password?: string;
}
