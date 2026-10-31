import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { TasksService } from './tasks.service';
import {
  CreateTaskCommentDto,
  CreateTaskDto,
  ListTasksQueryDto,
  UpdateTaskDto,
} from './dto/task.dto';

@Controller('api/v1/tasks')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @Permissions('tasks.create')
  create(@Body() dto: CreateTaskDto, @Request() req) {
    return this.tasksService.create(dto, req.user);
  }

  @Get()
  @Permissions('tasks.view')
  findAll(@Query() query: ListTasksQueryDto, @Request() req) {
    return this.tasksService.findAll(query, req.user);
  }

  @Get('summary')
  @Permissions('tasks.view')
  summary(@Query('scope') scope: string, @Request() req) {
    return this.tasksService.summary(req.user, scope === 'all' ? 'all' : 'mine');
  }

  @Get('assignees')
  @Permissions('tasks.assign')
  assignees(@Request() req) {
    return this.tasksService.assignees(req.user);
  }

  @Get(':id')
  @Permissions('tasks.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.tasksService.findOne(id, req.user);
  }

  @Patch(':id')
  @Permissions('tasks.update')
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto, @Request() req) {
    return this.tasksService.update(id, dto, req.user);
  }

  @Delete(':id')
  @Permissions('tasks.delete')
  remove(@Param('id') id: string, @Request() req) {
    return this.tasksService.remove(id, req.user);
  }

  @Get(':id/comments')
  @Permissions('tasks.view')
  listComments(@Param('id') id: string, @Request() req) {
    return this.tasksService.listComments(id, req.user);
  }

  @Post(':id/comments')
  @Permissions('tasks.view')
  addComment(@Param('id') id: string, @Body() dto: CreateTaskCommentDto, @Request() req) {
    return this.tasksService.addComment(id, dto, req.user);
  }
}
