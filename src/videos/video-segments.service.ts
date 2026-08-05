import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AppCacheService } from '../config/app-cache.service';
import {
  CACHE_TTL_ONE_DAY_MS,
  videoSegmentCacheKeys,
} from '../config/cache.config';
import { CreateVideoSegmentDto } from './dto/create-video-segment.dto';
import { VideoSegment } from './entities/video-segment.entity';
import { Video } from './entities/video.entity';

export type VideoSegmentResponse = {
  id: string;
  videoId: string;
  segmentNumber: number;
  languageName: string;
  startTime: number;
  durationSeconds: number;
  encryptedBytes: number;
  localBytes: number;
  remoteBytes: number;
  splitAt: number;
  localRatio: number;
  remoteRatio: number;
  localFile: string;
  hash: string;
  partOrders: { local: number; remote: number };
  remoteData: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class VideoSegmentsService {
  constructor(
    @InjectRepository(VideoSegment)
    private readonly segmentsRepository: Repository<VideoSegment>,
    @InjectRepository(Video)
    private readonly videosRepository: Repository<Video>,
    private readonly cache: AppCacheService,
  ) {}

  async create(
    dtos: CreateVideoSegmentDto[],
  ): Promise<VideoSegmentResponse | VideoSegmentResponse[]> {
    const videoIds = [...new Set(dtos.map((dto) => dto.videoId))];
    const videos = await this.videosRepository.find({
      where: { videoId: In(videoIds) },
    });
    const foundIds = new Set(videos.map((video) => video.videoId));
    const missing = videoIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new NotFoundException(
        `Video(s) not found for videoId: ${missing.join(', ')}`,
      );
    }

    const seenInRequest = new Set<string>();
    for (const dto of dtos) {
      const key = `${dto.videoId}:${dto.segmentNumber}`;
      if (seenInRequest.has(key)) {
        throw new ConflictException(
          `Duplicate segment in request for videoId ${dto.videoId}, segmentNumber ${dto.segmentNumber}`,
        );
      }
      seenInRequest.add(key);
    }

    for (const dto of dtos) {
      const existing = await this.segmentsRepository.findOne({
        where: {
          videoId: dto.videoId,
          segmentNumber: dto.segmentNumber,
        },
      });
      if (existing) {
        throw new ConflictException(
          `Segment ${dto.segmentNumber} already exists for videoId ${dto.videoId}`,
        );
      }
    }

    const entities = dtos.map((dto) =>
      this.segmentsRepository.create({
        videoId: dto.videoId,
        segmentNumber: dto.segmentNumber,
        languageName: dto.languageName,
        startTime: dto.startTime,
        durationSeconds: dto.durationSeconds,
        encryptedBytes: String(dto.encryptedBytes),
        localBytes: String(dto.localBytes),
        remoteBytes: String(dto.remoteBytes),
        splitAt: String(dto.splitAt),
        localRatio: dto.localRatio,
        remoteRatio: dto.remoteRatio,
        localFile: dto.localFile,
        hash: dto.hash,
        partOrders: dto.partOrders,
        remoteData: dto.remoteData,
      }),
    );

    const saved = await this.segmentsRepository.save(entities);
    const responses = saved.map((segment) => this.toResponse(segment));

    await Promise.all(
      responses.map((segment) =>
        this.cache.set(
          videoSegmentCacheKeys.one(segment.videoId, segment.segmentNumber),
          segment,
          CACHE_TTL_ONE_DAY_MS,
        ),
      ),
    );

    return responses.length === 1 ? responses[0] : responses;
  }

  async findOne(
    videoId: string,
    segmentNumber: number,
  ): Promise<VideoSegmentResponse> {
    const key = videoSegmentCacheKeys.one(videoId, segmentNumber);
    const cached = await this.cache.get<VideoSegmentResponse>(key);
    if (cached) {
      return cached;
    }

    const segment = await this.segmentsRepository.findOne({
      where: { videoId, segmentNumber },
    });
    if (!segment) {
      throw new NotFoundException(
        `Segment ${segmentNumber} not found for videoId ${videoId}`,
      );
    }

    const response = this.toResponse(segment);
    await this.cache.set(key, response, CACHE_TTL_ONE_DAY_MS);
    return response;
  }

  private toResponse(segment: VideoSegment): VideoSegmentResponse {
    return {
      id: segment.id,
      videoId: segment.videoId,
      segmentNumber: segment.segmentNumber,
      languageName: segment.languageName,
      startTime: segment.startTime,
      durationSeconds: segment.durationSeconds,
      encryptedBytes: Number(segment.encryptedBytes),
      localBytes: Number(segment.localBytes),
      remoteBytes: Number(segment.remoteBytes),
      splitAt: Number(segment.splitAt),
      localRatio: segment.localRatio,
      remoteRatio: segment.remoteRatio,
      localFile: segment.localFile,
      hash: segment.hash,
      partOrders: segment.partOrders,
      remoteData: segment.remoteData,
      createdAt: segment.createdAt,
      updatedAt: segment.updatedAt,
    };
  }
}
