import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AddIssueCommentDto {
  @ApiProperty({
    example: 'Still failing after restarting the app.',
    description: 'Comment to append to the issue thread.',
  })
  @IsString()
  @IsNotEmpty()
  message: string;
}
