import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppCacheService } from '../config/app-cache.service';
import { Video } from './entities/video.entity';
import { VideoSegment } from './entities/video-segment.entity';
import { VideosService } from './videos.service';
import { VideoSegmentsService } from './video-segments.service';

@Module({
  imports: [TypeOrmModule.forFeature([Video, VideoSegment])],
  providers: [AppCacheService, VideosService, VideoSegmentsService],
  exports: [VideosService, VideoSegmentsService],
})
export class VideosModule {}
