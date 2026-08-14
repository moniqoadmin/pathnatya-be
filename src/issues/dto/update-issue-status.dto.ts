import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { IssueStatus } from '../entities/issue.entity';

export class UpdateIssueStatusDto {
  @ApiProperty({
    enum: [IssueStatus.IN_PROGRESS],
    example: IssueStatus.IN_PROGRESS,
    description: 'Set the issue to in progress.',
  })
  @IsIn([IssueStatus.IN_PROGRESS])
  status: IssueStatus.IN_PROGRESS;
}
