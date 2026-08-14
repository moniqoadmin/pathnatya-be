import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { IssueStatus } from '../entities/issue.entity';

export class ResolveIssueDto {
  @ApiProperty({
    example: 'Client cache cleared; playback restored.',
    description: 'Short resolution summary.',
  })
  @IsString()
  @IsNotEmpty()
  resolution: string;

  @ApiProperty({
    example: 'Asked the user to reinstall and confirmed the video plays.',
    description: 'Longer note from SuperAdmin / Developer when resolving.',
  })
  @IsString()
  @IsNotEmpty()
  resolutionMessage: string;

  @ApiPropertyOptional({
    enum: [IssueStatus.RESOLVED, IssueStatus.CLOSED],
    default: IssueStatus.RESOLVED,
    description: 'Final status. Defaults to resolved.',
  })
  @IsOptional()
  @IsIn([IssueStatus.RESOLVED, IssueStatus.CLOSED])
  status?: IssueStatus.RESOLVED | IssueStatus.CLOSED;
}
