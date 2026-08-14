import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService } from './health.service';
import { SkipPayloadEncryption } from '../crypto/skip-payload-encryption.decorator';

@ApiTags('health')
@SkipThrottle()
@SkipPayloadEncryption()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async check() {
    const result = await this.healthService.check();
    if (result.status === 'down') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
