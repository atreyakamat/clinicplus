import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { BranchesService } from './branches.service';
import { CreateBranchDto, ListBranchesQueryDto, UpdateBranchDto } from './dto';

@Controller('api/v1/branches')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  @Permissions('branches.view')
  list(@Request() req, @Query() q: ListBranchesQueryDto) {
    return this.branches.list(req.user, q);
  }

  @Get(':id')
  @Permissions('branches.view')
  get(@Request() req, @Param('id') id: string) {
    return this.branches.get(req.user, id);
  }

  @Post()
  @Permissions('branches.manage')
  create(@Request() req, @Body() dto: CreateBranchDto) {
    return this.branches.create(req.user, dto);
  }

  @Patch(':id')
  @Permissions('branches.manage')
  update(@Request() req, @Param('id') id: string, @Body() dto: UpdateBranchDto) {
    return this.branches.update(req.user, id, dto);
  }

  /** Archives the branch (soft delete). */
  @Delete(':id')
  @Permissions('branches.manage')
  archive(@Request() req, @Param('id') id: string) {
    return this.branches.archive(req.user, id);
  }
}
