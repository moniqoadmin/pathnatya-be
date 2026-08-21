import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateEntitlementDto {
  @ApiProperty({ example: false })
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
