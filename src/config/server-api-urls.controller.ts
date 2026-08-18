import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipPayloadEncryption } from '../crypto/skip-payload-encryption.decorator';
import { UpsertServerApiUrlDto } from './dto/upsert-server-api-url.dto';
import { ServerApiUrlsService } from './server-api-urls.service';

@ApiTags('server-api-urls')
@Controller('server-api-urls')
export class ServerApiUrlsController {
  constructor(private readonly service: ServerApiUrlsService) {}

  @SkipPayloadEncryption()
  @Get()
  @ApiOperation({ summary: 'Get server API URLs. No authentication required.' })
  findAll() {
    return this.service.findAll();
  }

  @SkipPayloadEncryption()
  @Post()
  @ApiOperation({ summary: 'Create or update a server API URL. No authentication required.' })
  upsert(@Body() body: UpsertServerApiUrlDto) {
    return this.service.upsert(body.id, body.link);
  }
}
