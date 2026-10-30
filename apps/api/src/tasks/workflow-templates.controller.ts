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
import { WorkflowTemplatesService } from './workflow-templates.service';
import {
  CreateWorkflowTemplateDto,
  StartWorkflowDto,
  UpdateWorkflowTemplateDto,
} from './dto/workflow.dto';

@Controller('api/v1/workflow-templates')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class WorkflowTemplatesController {
  constructor(private readonly workflows: WorkflowTemplatesService) {}

  /** Visible to anyone who can see tasks so managers can start workflows. */
  @Get()
  @Permissions('tasks.view')
  findAll(@Query('includeInactive') includeInactive: string, @Request() req) {
    return this.workflows.findAll(req.user, includeInactive === 'true');
  }

  @Get(':id')
  @Permissions('tasks.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.workflows.findOne(id, req.user);
  }

  @Post()
  @Permissions('workflows.manage')
  create(@Body() dto: CreateWorkflowTemplateDto, @Request() req) {
    return this.workflows.create(dto, req.user);
  }

  @Patch(':id')
  @Permissions('workflows.manage')
  update(@Param('id') id: string, @Body() dto: UpdateWorkflowTemplateDto, @Request() req) {
    return this.workflows.update(id, dto, req.user);
  }

  @Delete(':id')
  @Permissions('workflows.manage')
  remove(@Param('id') id: string, @Request() req) {
    return this.workflows.remove(id, req.user);
  }

  /** Instantiates the template for a patient; creates tasks assigned to other staff, hence tasks.assign. */
  @Post(':id/start')
  @Permissions('tasks.create', 'tasks.assign')
  start(@Param('id') id: string, @Body() dto: StartWorkflowDto, @Request() req) {
    return this.workflows.start(id, dto, req.user);
  }
}
