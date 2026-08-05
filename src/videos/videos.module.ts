import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsModule } from '../accounts/accounts.module';
import { AppCacheService } from '../config/app-cache.service';
import { Video } from './entities/video.entity';
import { VideoSegment } from './entities/video-segment.entity';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';
import { VideoSegmentsController } from './video-segments.controller';
import { VideoSegmentsService } from './video-segments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Video, VideoSegment]),
    AccountsModule,
  ],
  controllers: [VideosController, VideoSegmentsController],
  providers: [AppCacheService, VideosService, VideoSegmentsService],
  exports: [VideosService, VideoSegmentsService],
})
export class VideosModule {}
