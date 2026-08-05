import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import type { Cache } from 'cache-manager';
import { Repository } from 'typeorm';
import {
  CACHE_TTL_ONE_DAY_MS,
  videoCacheKeys,
} from '../config/cache.config';
import { CreateVideoDto } from './dto/create-video.dto';
import { Video } from './entities/video.entity';

export type VideoResponse = {
  videoId: string;
  source: string;
  sourceBytes: number;
  segmentDurationSeconds: number;
  segmentCount: number;
  totalDurationSeconds: number;
  algorithm: string;
  header: string;
  keyDerivation: string;
  localDir: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class VideosService {
  constructor(
    @InjectRepository(Video)
    private readonly videosRepository: Repository<Video>,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async create(dto: CreateVideoDto): Promise<VideoResponse> {
    const existing = await this.videosRepository.findOne({
      where: { videoId: dto.videoId },
    });
    if (existing) {
      throw new ConflictException(
        `Video with videoId ${dto.videoId} already exists`,
      );
    }

    const video = this.videosRepository.create({
      videoId: dto.videoId,
      source: dto.source,
      sourceBytes: String(dto.sourceBytes),
      segmentDurationSeconds: dto.segmentDurationSeconds,
      segmentCount: dto.segmentCount,
      totalDurationSeconds: dto.totalDurationSeconds,
      algorithm: dto.algorithm,
      header: dto.header,
      keyDerivation: dto.keyDerivation,
      localDir: dto.localDir,
    });

    const saved = await this.videosRepository.save(video);
    const response = this.toResponse(saved);

    await this.cache.del(videoCacheKeys.all);
    await this.cache.set(
      videoCacheKeys.one(response.videoId),
      response,
      CACHE_TTL_ONE_DAY_MS,
    );

    return response;
  }

  async findAll(): Promise<VideoResponse[]> {
    const cached = await this.cache.get<VideoResponse[]>(videoCacheKeys.all);
    if (cached) {
      return cached;
    }

    const videos = await this.videosRepository.find({
      order: { createdAt: 'DESC' },
    });
    const response = videos.map((video) => this.toResponse(video));
    await this.cache.set(videoCacheKeys.all, response, CACHE_TTL_ONE_DAY_MS);
    return response;
  }

  async findOne(videoId: string): Promise<VideoResponse> {
    const key = videoCacheKeys.one(videoId);
    const cached = await this.cache.get<VideoResponse>(key);
    if (cached) {
      return cached;
    }

    const video = await this.videosRepository.findOne({ where: { videoId } });
    if (!video) {
      throw new NotFoundException(`Video with videoId ${videoId} not found`);
    }

    const response = this.toResponse(video);
    await this.cache.set(key, response, CACHE_TTL_ONE_DAY_MS);
    return response;
  }

  private toResponse(video: Video): VideoResponse {
    return {
      videoId: video.videoId,
      source: video.source,
      sourceBytes: Number(video.sourceBytes),
      segmentDurationSeconds: video.segmentDurationSeconds,
      segmentCount: video.segmentCount,
      totalDurationSeconds: video.totalDurationSeconds,
      algorithm: video.algorithm,
      header: video.header,
      keyDerivation: video.keyDerivation,
      localDir: video.localDir,
      createdAt: video.createdAt,
      updatedAt: video.updatedAt,
    };
  }
}
