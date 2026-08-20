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
    const result = await this.healthService.check();
    const body = { ...result, version: '4.9.0' , videoVersion: '1.0.0' };
    if (result.status === 'down') {
      throw new ServiceUnavailableException(body);
    }
    return body;
  }

  @Get('time')
  @ApiOperation({
    summary: 'Current server time in UTC (ISO-8601 and Unix milliseconds)',
  })
  now() {
    return this.healthService.now();
  }
}
