import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { ListAccountsQueryDto } from './dto/list-accounts-query.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { LoginDto } from './dto/login.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { CheckPhoneDto } from './dto/check-phone.dto';
import { JweAuthGuard } from './guards/jwe-auth.guard';
import { AppKeyGuard } from './guards/app-key.guard';
import { Public } from './decorators/public.decorator';
import { JweService } from './jwe.service';
import { SkipPayloadEncryption } from '../crypto/skip-payload-encryption.decorator';
import { AccountRole } from './entities/account.entity';

const AuthThrottle = () => Throttle({ default: { limit: 10, ttl: 60_000 } });

@ApiTags('accounts')
@ApiHeader({
  name: 'X-App-Key',
  description: 'Shared secret embedded in the Electron app',
  required: true,
})
@ApiBearerAuth()
@UseGuards(AppKeyGuard, JweAuthGuard)
@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly jweService: JweService,
  ) {}

  @Public()
  @AuthThrottle()
  @Post()
  @ApiOperation({ summary: 'Create an account' })
  create(@Body() createAccountDto: CreateAccountDto, @Ip() ip: string) {
    return this.accountsService.create(createAccountDto, ip);
  }

  @SkipPayloadEncryption()
  @Get('bulk/template')
  @ApiOperation({ summary: 'Download an account upload template.' })
  async downloadTemplate(@Res() res: Response) {
    const buffer = await this.accountsService.generateTemplate();
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="accounts-template.xlsx"',
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Public()
  @AuthThrottle()
  @Post('check-phone')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check whether the selected team needs its password set.',
  })
  checkPhone(@Body() dto: CheckPhoneDto) {
    return this.accountsService.checkPhone(dto.phoneNumber, dto.teamNumber);
  }

  @Public()
  @AuthThrottle()
  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set the password for one team.' })
  setPassword(@Body() dto: SetPasswordDto, @Ip() ipAddress: string) {
    return this.accountsService.setPassword(dto, dto.ipAddress ?? ipAddress);
  }

  @Public()
  @AuthThrottle()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({
    name: 'X-Load-Test-Key',
    description: 'When configured for non-production load testing, skips rate limiting.',
    required: false,
  })
  @ApiOperation({ summary: 'Login using phone number + team + team password.' })
  login(@Body() dto: LoginDto, @Ip() ipAddress: string) {
    return this.accountsService.login(dto, dto.ipAddress ?? ipAddress);
  }

  @Get('login-token')
  @ApiOperation({ summary: 'Return the login success keys.' })
  getLoginToken() {
    return { keys: this.jweService.getLoginKeys() };
  }

  @Get('roles')
  @ApiOperation({ summary: 'Return all account roles.' })
  getRoles() {
    return { roles: Object.values(AccountRole) };
  }

  @Get()
  findAll(@Req() req: Request, @Query() query: ListAccountsQueryDto) {
    return this.accountsService.findAll(req.user!.sub, query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.accountsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateAccountDto: UpdateAccountDto,
  ) {
    return this.accountsService.update(req.user!.sub, id, updateAccountDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.accountsService.remove(id);
  }
}
