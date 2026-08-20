import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
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
      'When true, this team must set a password again. The password hash and bound system address are cleared. Admins may only change this from false to true.',
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
    example:
      'User completed the required follow-up after the previous login block.',
    description:
      'Required when enabling login (isLoginDisabled=false). Stored as the USER_ENABLED audit-trail message.',
  })
  @ValidateIf((dto: UpdateTeamDto) => dto.isLoginDisabled === false)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason?: string;

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

export class PatchTeamDto extends OmitType(UpdateTeamDto, [
  'teamNumber',
] as const) {}
