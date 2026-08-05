import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import {
  BulkCreateVideoSegmentsDto,
  CreateVideoSegmentDto,
} from '../dto/create-video-segment.dto';

function formatErrors(
  errors: ValidationError[],
  prefix = '',
): string[] {
  return errors.flatMap((error) => {
    const path = prefix
      ? `${prefix}.${error.property}`
      : error.property;
    const own = error.constraints
      ? Object.values(error.constraints).map((message) => `${path}: ${message}`)
      : [];
    const nested = error.children?.length
      ? formatErrors(error.children, path)
      : [];
    return [...own, ...nested];
  });
}

function isBulkBody(
  value: unknown,
): value is { videoId: unknown; segments: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'segments' in value
  );
}

@Injectable()
export class ParseVideoSegmentsPipe
  implements PipeTransform<unknown, Promise<CreateVideoSegmentDto[]>>
{
  async transform(
    value: unknown,
    _metadata: ArgumentMetadata,
  ): Promise<CreateVideoSegmentDto[]> {
    if (value === null || value === undefined) {
      throw new BadRequestException('Request body is required');
    }

    // Bulk: { videoId, segments: [...] }
    if (isBulkBody(value)) {
      const bulk = plainToInstance(BulkCreateVideoSegmentsDto, value);
      const bulkErrors = await validate(bulk, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      if (bulkErrors.length > 0) {
        throw new BadRequestException(formatErrors(bulkErrors));
      }

      return bulk.segments.map((segment) =>
        plainToInstance(CreateVideoSegmentDto, {
          ...segment,
          videoId: bulk.videoId,
        }),
      );
    }

    // Single segment or array of full segments (each with videoId)
    const items = Array.isArray(value) ? value : [value];
    if (items.length === 0) {
      throw new BadRequestException('At least one segment is required');
    }

    const dtos = plainToInstance(CreateVideoSegmentDto, items);
    const errors = await Promise.all(
      dtos.map((dto) =>
        validate(dto, {
          whitelist: true,
          forbidNonWhitelisted: true,
        }),
      ),
    );

    const messages = errors.flatMap((itemErrors, index) =>
      formatErrors(itemErrors, `segments[${index}]`),
    );

    if (messages.length > 0) {
      throw new BadRequestException(messages);
    }

    return dtos;
  }
}
