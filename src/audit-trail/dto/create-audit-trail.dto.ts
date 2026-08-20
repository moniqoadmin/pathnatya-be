import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateAuditTrailDto {
  @ApiProperty({
    example: 'account_updated',
    description: 'Action performed on the admin panel.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  event: string;

  @ApiProperty({
    example: 'Updated logout button and team count for account 9876543210.',
    description: 'Human-readable description of the action.',
  })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({
    example: '11111111-1111-1111-1111-111111111111',
    description: 'Account the admin action was performed against, if any.',
  })
  @IsOptional()
  @IsUUID()
  targetAccountId?: string;

  @ApiPropertyOptional({
    example: { field: 'logoutButton', previousValue: true, nextValue: false },
    description: 'Arbitrary JSON details for this admin action.',
  })
  @IsOptional()
  @IsObject()
  metaData?: Record<string, unknown>;
}
