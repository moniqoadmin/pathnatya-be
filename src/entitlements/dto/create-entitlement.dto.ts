import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateEntitlementDto {
  @ApiProperty({
    example: 'ADMIN_LOGIN_ELECTRON_APP',
    description: 'Uppercase identifier (letters, digits, underscores).',
  })
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]*$/, {
    message:
      'key must be uppercase letters, digits, and underscores, starting with a letter',
  })
  @MaxLength(100)
  key: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({
    example:
      'When true, Admin, SuperAdmin, and Developer may log in from the Electron app.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
