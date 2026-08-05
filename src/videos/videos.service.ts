import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    return this.toResponse(saved);
  }

  async findAll(): Promise<VideoResponse[]> {
    const videos = await this.videosRepository.find({
      order: { createdAt: 'DESC' },
    });
    return videos.map((video) => this.toResponse(video));
  }

  async findOne(videoId: string): Promise<VideoResponse> {
    const video = await this.videosRepository.findOne({ where: { videoId } });
    if (!video) {
      throw new NotFoundException(`Video with videoId ${videoId} not found`);
    }
    return this.toResponse(video);
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
