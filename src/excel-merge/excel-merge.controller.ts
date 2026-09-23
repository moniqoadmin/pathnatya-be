import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { OptionalAdminQueryDto } from '../accounts/dto/optional-admin-query.dto';
import { Roles } from '../accounts/decorators/roles.decorator';
import { AccountRole } from '../accounts/entities/account.entity';
import { AppKeyGuard } from '../accounts/guards/app-key.guard';
import { JweAuthGuard } from '../accounts/guards/jwe-auth.guard';
import { RolesGuard } from '../accounts/guards/roles.guard';
import { SkipPayloadEncryption } from '../crypto/skip-payload-encryption.decorator';
import {
  ConfirmMappingDto,
  CreateMergeTaskDto,
  AddTaskColumnsDto,
  UpdateMergeTaskDto,
  UpdateTaskColumnDto,
  UpdateTaskErrorDto,
} from './dto/excel-merge.dto';
import {
  ListMergeFilesQueryDto,
  ListMergeTasksQueryDto,
  ListTaskDataQueryDto,
  ListTaskErrorsQueryDto,
} from './dto/list-excel-merge-query.dto';
import { ExcelMergeService } from './excel-merge.service';

@ApiTags('excel merge')
@ApiHeader({
  name: 'X-App-Key',
  description: 'Shared secret embedded in the Electron app',
  required: true,
})
@ApiBearerAuth()
@Roles(AccountRole.ADMIN, AccountRole.SUPER_ADMIN, AccountRole.DEVELOPER)
@UseGuards(AppKeyGuard, JweAuthGuard, RolesGuard)
@Controller('excel-merge/tasks')
export class ExcelMergeController {
  constructor(private readonly merge: ExcelMergeService) {}

  @Post()
  @ApiOperation({
    summary:
      'Create a merge task (one type of data collection). Optional initial master columns. Admin, SuperAdmin, and Developer.',
  })
  create(@Req() req: Request, @Body() dto: CreateMergeTaskDto) {
    return this.merge.createTask(req.user!.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List merge tasks, newest first.' })
  list(@Query() query: ListMergeTasksQueryDto) {
    return this.merge.listTasks(query);
  }

  @Get(':taskId')
  @ApiOperation({
    summary: 'Get a task, its master columns, and row counts.',
  })
  get(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Query() query: OptionalAdminQueryDto,
  ) {
    void query;
    return this.merge.getTask(taskId);
  }

  @Patch(':taskId')
  @ApiOperation({ summary: 'Rename a task or update its description.' })
  update(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateMergeTaskDto,
  ) {
    return this.merge.updateTask(taskId, dto);
  }

  @Delete(':taskId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a task and all of its files, rows, and errors.',
  })
  remove(@Param('taskId', ParseUUIDPipe) taskId: string) {
    return this.merge.deleteTask(taskId);
  }

  @Post(':taskId/columns')
  @ApiOperation({
    summary: 'Add one or more master columns to the task schema.',
  })
  addColumns(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: AddTaskColumnsDto,
  ) {
    return this.merge.addColumns(taskId, dto.columns);
  }

  @Patch(':taskId/columns/:columnId')
  @ApiOperation({
    summary: 'Update a master column label, type, required flag, or order.',
  })
  updateColumn(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('columnId', ParseUUIDPipe) columnId: string,
    @Body() dto: UpdateTaskColumnDto,
  ) {
    return this.merge.updateColumn(taskId, columnId, dto);
  }

  @Delete(':taskId/columns/:columnId')
  @ApiOperation({ summary: 'Remove a master column from the task schema.' })
  deleteColumn(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('columnId', ParseUUIDPipe) columnId: string,
  ) {
    return this.merge.deleteColumn(taskId, columnId);
  }

  @Post(':taskId/files')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiOperation({
    summary:
      'Upload one or more Excel files. Each file is analyzed automatically (sheets, header row, columns). Field name must be "files".',
  })
  @UseInterceptors(
    FilesInterceptor('files', 100, { limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  upload(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Req() req: Request,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.merge.uploadFiles(taskId, req.user!.sub, files);
  }

  @Get(':taskId/files')
  @ApiOperation({ summary: 'List uploaded files for a task.' })
  listFiles(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Query() query: ListMergeFilesQueryDto,
  ) {
    return this.merge.listFiles(taskId, query);
  }

  @Get(':taskId/files/:fileId')
  @ApiOperation({
    summary:
      'File analysis plus suggested column mappings (saved mappings are reused when the same header appears again).',
  })
  getFile(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Query() query: OptionalAdminQueryDto,
  ) {
    void query;
    return this.merge.getFile(taskId, fileId);
  }

  @Put(':taskId/files/:fileId/mapping')
  @ApiOperation({
    summary:
      'Confirm column mapping. Map to an existing master column, create a new one, or ignore. Processing starts by default (process=false to save only).',
  })
  confirmMapping(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Body() dto: ConfirmMappingDto,
  ) {
    return this.merge.confirmMapping(taskId, fileId, dto);
  }

  @Post(':taskId/files/:fileId/process')
  @ApiOperation({
    summary:
      'Process a file whose mapping is already confirmed. Valid rows go to main data; invalid rows go to errors.',
  })
  process(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.merge.processFile(taskId, fileId);
  }

  @Get(':taskId/data')
  @ApiOperation({
    summary: 'List valid merged rows (ready for combined Excel export).',
  })
  listData(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Query() query: ListTaskDataQueryDto,
  ) {
    return this.merge.listData(taskId, query);
  }

  @Get(':taskId/errors')
  @ApiOperation({
    summary:
      'List error rows for review. Each field includes valid/message for a simple correction UI.',
  })
  listErrors(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Query() query: ListTaskErrorsQueryDto,
  ) {
    return this.merge.listErrors(taskId, query);
  }

  @Patch(':taskId/errors/:errorId')
  @ApiOperation({
    summary:
      'Edit incorrect values. Set approve=true to Save & Approve: valid rows move to main data; original uploaded values are kept.',
  })
  updateError(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('errorId', ParseUUIDPipe) errorId: string,
    @Body() dto: UpdateTaskErrorDto,
  ) {
    return this.merge.updateError(taskId, errorId, dto);
  }

  @SkipPayloadEncryption()
  @Get(':taskId/export')
  @ApiOperation({
    summary:
      'Download combined Excel using the task master structure. Pending error rows are not included.',
  })
  async exportMaster(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Res() res: Response,
    @Query() query: OptionalAdminQueryDto,
  ) {
    void query;
    const { buffer, fileName } = await this.merge.exportMaster(taskId);
    this.sendExcel(res, buffer, fileName);
  }

  @SkipPayloadEncryption()
  @Get(':taskId/export/errors')
  @ApiOperation({
    summary: 'Download pending error rows as Excel for offline review.',
  })
  async exportErrors(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Res() res: Response,
    @Query() query: OptionalAdminQueryDto,
  ) {
    void query;
    const { buffer, fileName } = await this.merge.exportErrors(taskId);
    this.sendExcel(res, buffer, fileName);
  }

  private sendExcel(res: Response, buffer: Buffer, fileName: string) {
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }
}
