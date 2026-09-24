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
  BulkCreateTaskDataDto,
  BulkUpdateTaskDataDto,
  CreateTaskDataDto,
  DeleteTaskDataDto,
  DeleteTaskErrorsDto,
  SaveTaskSummaryDto,
  UpdateMergeTaskDto,
  UpdateTaskColumnDto,
  UpdateTaskDataDto,
  UpdateTaskErrorDto,
} from './dto/excel-merge.dto';
import {
  ExportTaskDataQueryDto,
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
      'Create a merge task (one type of data collection). Optional initial output columns. Admin, SuperAdmin, and Developer.',
  })
  create(@Req() req: Request, @Body() dto: CreateMergeTaskDto) {
    return this.merge.createTask(req.user!.sub, dto);
  }

  @Get()
  @ApiOperation({
    summary:
      'List merge tasks. sort is name, description, createdAt, or updatedAt. order is asc or desc. Defaults to newest first.',
  })
  list(@Query() query: ListMergeTasksQueryDto) {
    return this.merge.listTasks(query);
  }

  @Get(':taskId')
  @ApiOperation({
    summary: 'Get a task, its current output format (columns), and row counts.',
  })
  get(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Query() query: OptionalAdminQueryDto,
  ) {
    void query;
    return this.merge.getTask(taskId);
  }

  @Get(':taskId/summary')
  @ApiOperation({
    summary:
      'Get the saved summary setup for a task: row column, header column, total label, and metric rows.',
  })
  getSummary(@Param('taskId', ParseUUIDPipe) taskId: string) {
    return this.merge.getSummary(taskId);
  }

  @Put(':taskId/summary')
  @ApiOperation({
    summary:
      'Save or replace the summary setup for a task. The download writes it on the Summary sheet.',
  })
  updateSummary(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: SaveTaskSummaryDto,
  ) {
    return this.merge.updateSummary(taskId, dto);
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
    summary:
      'Add one or more output columns. Allowed after files have already been processed.',
  })
  addColumns(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: AddTaskColumnsDto,
  ) {
    return this.merge.addColumns(taskId, dto.columns);
  }

  @Patch(':taskId/columns/:columnId')
  @ApiOperation({
    summary:
      'Update an output column label, type, required flag, primary flag, or order.',
  })
  updateColumn(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('columnId', ParseUUIDPipe) columnId: string,
    @Body() dto: UpdateTaskColumnDto,
  ) {
    return this.merge.updateColumn(taskId, columnId, dto);
  }

  @Delete(':taskId/columns/:columnId')
  @ApiOperation({ summary: 'Remove an output column from the task.' })
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
  @ApiOperation({
    summary:
      'List uploaded files for a task. sort is a file field such as fileName, status, or createdAt. order is asc or desc.',
  })
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
      'Confirm column mapping. Map to an existing output column, add a new one, or ignore. Processing starts by default (process=false to save only).',
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
    summary:
      'List valid merged rows. sort is any output column key, or createdAt, sourceRowNumber, or fileName. order is asc or desc.',
  })
  listData(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Query() query: ListTaskDataQueryDto,
  ) {
    return this.merge.listData(taskId, query);
  }

  @Post(':taskId/data/bulk')
  @ApiOperation({
    summary:
      'Add many valid rows at once. Every row is checked before any row is saved. Invalid values or a repeated primary value reject the whole request.',
  })
  createDataBulk(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: BulkCreateTaskDataDto,
  ) {
    return this.merge.createDataBulk(taskId, dto);
  }

  @Patch(':taskId/data/bulk')
  @ApiOperation({
    summary:
      'Update many valid rows. Send ids plus values to apply the same change, or rows to change each row differently. Invalid rows reject the whole request. Original uploaded values are kept.',
  })
  updateDataBulk(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: BulkUpdateTaskDataDto,
  ) {
    return this.merge.updateDataBulk(taskId, dto);
  }

  @Post(':taskId/data')
  @ApiOperation({
    summary:
      'Add one valid row. Values are checked against the output columns. fileId is optional for a row added directly to the merged data.',
  })
  createData(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: CreateTaskDataDto,
  ) {
    return this.merge.createData(taskId, dto);
  }

  @Delete(':taskId/data')
  @ApiOperation({
    summary:
      'Delete valid rows by id. Removed rows are left out of the combined Excel.',
  })
  deleteDataBulk(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: DeleteTaskDataDto,
  ) {
    return this.merge.deleteDataBulk(taskId, dto.ids);
  }

  @Get(':taskId/data/:dataId')
  @ApiOperation({ summary: 'Get one valid merged row.' })
  getData(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('dataId', ParseUUIDPipe) dataId: string,
  ) {
    return this.merge.getData(taskId, dataId);
  }

  @Patch(':taskId/data/:dataId')
  @ApiOperation({
    summary:
      'Edit values on a merged row. Invalid values are rejected and the row stays unchanged. Original uploaded values are kept.',
  })
  updateData(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('dataId', ParseUUIDPipe) dataId: string,
    @Body() dto: UpdateTaskDataDto,
  ) {
    return this.merge.updateData(taskId, dataId, dto);
  }

  @Delete(':taskId/data/:dataId')
  @ApiOperation({
    summary:
      'Delete one valid row. It is left out of the combined Excel.',
  })
  deleteData(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('dataId', ParseUUIDPipe) dataId: string,
  ) {
    return this.merge.deleteData(taskId, dataId);
  }

  @Get(':taskId/errors')
  @ApiOperation({
    summary:
      'List error rows for review. sort is any output column key, or createdAt, updatedAt, sourceRowNumber, fileName, or status. order is asc or desc.',
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

  @Delete(':taskId/errors')
  @ApiOperation({
    summary:
      'Delete pending error rows. Dropped rows are not included in the combined Excel.',
  })
  deleteErrors(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: DeleteTaskErrorsDto,
  ) {
    return this.merge.deleteErrors(taskId, dto.ids);
  }

  @Delete(':taskId/errors/:errorId')
  @ApiOperation({
    summary:
      'Delete one pending error row. It is dropped and is not included in the combined Excel.',
  })
  deleteError(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('errorId', ParseUUIDPipe) errorId: string,
  ) {
    return this.merge.deleteError(taskId, errorId);
  }

  @SkipPayloadEncryption()
  @Get(':taskId/export')
  @ApiOperation({
    summary:
      'Download combined Excel. Rows are on the Kendra sheet, with SN numbered 1 through the last row in the current sort order. When a summary is saved, a Summary sheet is included. rowColumn, columnColumn, and totalLabel update the saved setup. Pending error rows are not included.',
  })
  async exportMaster(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Res() res: Response,
    @Query() query: ExportTaskDataQueryDto,
  ) {
    const { buffer, fileName } = await this.merge.exportMaster(taskId, query);
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
