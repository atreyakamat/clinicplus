import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { WorkflowTemplatesController } from './workflow-templates.controller';
import { WorkflowTemplatesService } from './workflow-templates.service';
import { TaskAutomationService } from './task-automation.service';

@Module({
  controllers: [TasksController, WorkflowTemplatesController],
  providers: [TasksService, WorkflowTemplatesService, TaskAutomationService],
  exports: [TasksService, TaskAutomationService],
})
export class TasksModule {}
