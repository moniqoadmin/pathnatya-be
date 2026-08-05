import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AppKeyGuard } from '../accounts/guards/app-key.guard';
import { JweAuthGuard } from '../accounts/guards/jwe-auth.guard';
import { CreateVideoDto } from './dto/create-video.dto';
import { VideosService } from './videos.service';

@ApiTags('videos')
@ApiHeader({
  name: 'X-App-Key',
  description: 'Shared secret embedded in the Electron app',
  required: true,
})
@ApiBearerAuth()
@UseGuards(AppKeyGuard, JweAuthGuard)
@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Post()
  @ApiOperation({ summary: 'Create a video record' })
  create(@Body() createVideoDto: CreateVideoDto) {
    return this.videosService.create(createVideoDto);
  }

  @Get()
  @ApiOperation({ summary: 'List all videos' })
  findAll() {
    return this.videosService.findAll();
  }

  @Get(':videoId')
  @ApiOperation({ summary: 'Get a video by videoId' })
  findOne(@Param('videoId') videoId: string) {
    return this.videosService.findOne(videoId);
  }
}
