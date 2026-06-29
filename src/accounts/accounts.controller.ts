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
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { LoginDto } from './dto/login.dto';
import { SetPasswordDto } from './dto/set-password.dto';

@ApiTags('accounts')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an account' })
  create(@Body() createAccountDto: CreateAccountDto, @Ip() ip: string) {
    return this.accountsService.create(createAccountDto, ip);
  }

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

  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Set or reset an account password by phone number. Sets setPassword to false.',
  })
  setPassword(@Body() setPasswordDto: SetPasswordDto) {
    return this.accountsService.setPassword(setPasswordDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Login with phone number + password. Returns account details and a constant token, or "User not found" / "Password wrong".',
  })
  login(@Body() loginDto: LoginDto) {
    return this.accountsService.login(loginDto);
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
