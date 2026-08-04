import {
  BadRequestException,
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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { LoginDto } from './dto/login.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { CheckPhoneDto } from './dto/check-phone.dto';
import { JweAuthGuard } from './guards/jwe-auth.guard';
import { AppKeyGuard } from './guards/app-key.guard';
import { Public } from './decorators/public.decorator';
import { JweService } from './jwe.service';
import { SkipPayloadEncryption } from '../crypto/skip-payload-encryption.decorator';

/** Stricter per-IP limit for unauthenticated / credential endpoints. */
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
  @ApiOperation({
    summary:
      'Download an .xlsx template (headers only) to fill in and upload back.',
  })
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

  @Post('bulk/upload')
  @ApiOperation({
    summary: 'Bulk create accounts from a filled-in .xlsx template.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  bulkUpload(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded (field name must be "file")');
    }
    return this.accountsService.bulkUpload(file.buffer);
  }

  @Public()
  @AuthThrottle()
  @Post('check-phone')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Check if a phone number has an account. Returns { exists, needsPassword } so the client can decide whether to call set-password.',
  })
  checkPhone(@Body() checkPhoneDto: CheckPhoneDto) {
    return this.accountsService.checkPhone(checkPhoneDto.phoneNumber);
  }

  @Public()
  @AuthThrottle()
  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Set or reset an account password by phone number. Sets setPassword to false.',
  })
  setPassword(@Body() setPasswordDto: SetPasswordDto, @Ip() ipAddress: string) {
    return this.accountsService.setPassword(
      setPasswordDto,
      setPasswordDto.ipAddress ?? ipAddress,
    );
  }

  @Public()
  @AuthThrottle()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({
    name: 'X-Load-Test-Key',
    description:
      'When set to LOAD_TEST_KEY, skips rate limiting (for load testing only).',
    required: false,
  })
  @ApiOperation({
    summary:
      'Login with phone number + password. Returns account details and a JWE token, or "User not found" / "Password wrong".',
  })
  login(@Body() loginDto: LoginDto, @Ip() ipAddress: string) {
    return this.accountsService.login(
      loginDto,
      loginDto.ipAddress ?? ipAddress,
    );
  }

  @Get('login-token')
  @ApiOperation({
    summary: 'Return the five login success keys.',
  })
  getLoginToken() {
    return { keys: this.jweService.getLoginKeys() };
  }

  @Get()
  @ApiOperation({ summary: 'List all accounts' })
  findAll() {
    return this.accountsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an account by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.accountsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update an account (password / status). phoneNumber is immutable.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateAccountDto: UpdateAccountDto,
  ) {
    return this.accountsService.update(id, updateAccountDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an account' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.accountsService.remove(id);
  }
}
