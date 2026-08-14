import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
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
import { AddIssueCommentDto } from './dto/add-issue-comment.dto';
import { CreateIssueDto } from './dto/create-issue.dto';
import {
  ListIssuesQueryDto,
  OptionalAdminQueryDto,
} from './dto/list-issues-query.dto';
import { ResolveIssueDto } from './dto/resolve-issue.dto';
import { IssuesService } from './issues.service';

@ApiTags('issues')
@ApiHeader({
  name: 'X-App-Key',
  description: 'Shared secret embedded in the Electron app',
  required: true,
})
@ApiBearerAuth()
@UseGuards(AppKeyGuard, JweAuthGuard)
@Controller('issues')
export class IssuesController {
  constructor(private readonly issuesService: IssuesService) {}

  @Post()
  @ApiOperation({
    summary:
      'Report an issue for a phone number. Optional admin query flag. reportedBy is the authenticated caller. Users may only use their own phone; Admins may report for Users in their sanghat; SuperAdmin and Developer may report for any account.',
  })
  create(
    @Req() req: Request,
    @Query() _query: OptionalAdminQueryDto,
    @Body() createIssueDto: CreateIssueDto,
  ) {
    return this.issuesService.create(req.user!.sub, createIssueDto);
  }

  @Get()
  @ApiOperation({
    summary:
      'List issues reported by the authenticated account. Optional admin query flag.',
  })
  findMine(@Req() req: Request, @Query() query: ListIssuesQueryDto) {
    return this.issuesService.findMine(req.user!.sub, query);
  }

  @Get('pending')
  @ApiOperation({
    summary:
      'List open and in-progress issues. Optional admin query flag. SuperAdmin and Developer only.',
  })
  findPending(@Req() req: Request, @Query() query: ListIssuesQueryDto) {
    return this.issuesService.findPending(req.user!.sub, query);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Get one issue. Optional admin query flag. Reporters may view their own; SuperAdmin and Developer may view any.',
  })
  findOne(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() _query: OptionalAdminQueryDto,
  ) {
    return this.issuesService.findOne(id, req.user!.sub);
  }

  @Post(':id/comments')
  @ApiOperation({
    summary:
      'Add a comment. Optional admin query flag. The reporter may comment on their own issue; SuperAdmin and Developer may comment on any.',
  })
  addComment(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() _query: OptionalAdminQueryDto,
    @Body() addIssueCommentDto: AddIssueCommentDto,
  ) {
    return this.issuesService.addComment(
      id,
      req.user!.sub,
      addIssueCommentDto,
    );
  }

  @Patch(':id/resolve')
  @ApiOperation({
    summary:
      'Resolve an issue with resolution and resolutionMessage. Optional admin query flag. SuperAdmin and Developer only.',
  })
  resolve(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() _query: OptionalAdminQueryDto,
    @Body() resolveIssueDto: ResolveIssueDto,
  ) {
    return this.issuesService.resolve(
      id,
      req.user!.sub,
      resolveIssueDto,
    );
  }
}
