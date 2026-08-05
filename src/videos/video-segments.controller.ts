import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiExtraModels,
  ApiHeader,
  ApiOperation,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { AppKeyGuard } from '../accounts/guards/app-key.guard';
import { JweAuthGuard } from '../accounts/guards/jwe-auth.guard';
import {
  BulkCreateVideoSegmentsDto,
  CreateVideoSegmentDto,
} from './dto/create-video-segment.dto';
import { ParseVideoSegmentsPipe } from './pipes/parse-video-segments.pipe';
import { VideoSegmentsService } from './video-segments.service';

@ApiTags('video-segments')
@ApiExtraModels(CreateVideoSegmentDto, BulkCreateVideoSegmentsDto)
@ApiHeader({
  name: 'X-App-Key',
  description: 'Shared secret embedded in the Electron app',
  required: true,
})
@ApiBearerAuth()
@UseGuards(AppKeyGuard, JweAuthGuard)
@Controller('video-segments')
export class VideoSegmentsController {
  constructor(private readonly videoSegmentsService: VideoSegmentsService) {}

  @Post()
  @ApiOperation({
    summary:
      'Create one segment, an array of segments, or a bulk payload { videoId, segments }. Duplicate (videoId, segmentNumber) pairs are rejected.',
  })
  @ApiBody({
    description:
      'Single segment (with videoId), array of segments (each with videoId), or bulk { videoId, segments } where segments omit videoId.',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(CreateVideoSegmentDto) },
        {
          type: 'array',
          items: { $ref: getSchemaPath(CreateVideoSegmentDto) },
        },
        { $ref: getSchemaPath(BulkCreateVideoSegmentsDto) },
      ],
    },
  })
  create(
    @Body(ParseVideoSegmentsPipe) segments: CreateVideoSegmentDto[],
  ) {
    return this.videoSegmentsService.create(segments);
  }

  @Get(':videoId/:segmentNumber')
  @ApiOperation({
    summary: 'Get one segment by videoId and segmentNumber',
  })
  findOne(
    @Param('videoId') videoId: string,
    @Param('segmentNumber', ParseIntPipe) segmentNumber: number,
  ) {
    return this.videoSegmentsService.findOne(videoId, segmentNumber);
  }
}
