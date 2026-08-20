import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
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
    return this.healthResponse();
  }

  @Get('time')
  @ApiOperation({
    summary: 'Current server time in UTC (ISO-8601 and Unix milliseconds)',
  })
  async now() {
    return this.healthResponse();
  }

  private async healthResponse() {
    const result = await this.healthService.check();
    const body = {
      ...result,
      ...this.healthService.now(),
      version: '4.9.0',
      videoVersion: '2.0.0',
    };
    if (result.status === 'down') {
      throw new ServiceUnavailableException(body);
    }
    return body;
  }
}
