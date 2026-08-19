import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AppKeyGuard } from '../accounts/guards/app-key.guard';
import { JweAuthGuard } from '../accounts/guards/jwe-auth.guard';
import { CreateLogDto } from './dto/create-log.dto';
import { LogsService } from './logs.service';
import { UnwrapDataInterceptor } from './unwrap-data.interceptor';

@ApiTags('logs')
@ApiHeader({
  name: 'X-App-Key',
  description: 'Shared secret embedded in the Electron app',
  required: true,
})
@ApiBearerAuth()
@UseGuards(AppKeyGuard, JweAuthGuard)
@Controller('logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Post()
  @UseInterceptors(UnwrapDataInterceptor)
  @ApiOperation({
    summary:
      'Create a log event. Account id and phone number are taken from the auth token. FILES_TAMPERED requires ipAddress (MAC) and disables login only for that device team. Body may be flat or wrapped as { data: { event, tampered, ipAddress, metadata } }.',
  })
  create(@Req() req: Request, @Body() createLogDto: CreateLogDto) {
    return this.logsService.create(req.user!.sub, createLogDto);
  }

  @Get()
  @ApiOperation({
    summary: 'List log events for the authenticated account (from token).',
  })
  findAll(@Req() req: Request) {
    return this.logsService.findAllForAccount(req.user!.sub);
  }

  @Get(':logId')
  @ApiOperation({
    summary: 'Get a single log event by logId (scoped to the authenticated account).',
  })
  findOne(
    @Req() req: Request,
    @Param('logId', ParseUUIDPipe) logId: string,
  ) {
    return this.logsService.findOne(logId, req.user!.sub);
  }
}
