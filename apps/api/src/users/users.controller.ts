import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ListUsersQueryDto, MoveBranchDto, SetRolesDto } from './dto/user-admin.dto';
import { normalizePermission } from '../auth/access.utils';

@Controller('api/v1/users')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Permissions('users.view')
  findAll(@Request() req, @Query() q: ListUsersQueryDto) {
    return this.usersService.list(req.user, q);
  }

  /** Own profile: any authenticated user. */
  @Get('me')
  me(@Request() req) {
    return this.usersService.findOne(req.user.id, req.user.organizationId);
  }

  @Get(':id')
  @Permissions('users.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.usersService.findOneScoped(id, req.user);
  }

  /** Own profile: any authenticated user. Other users: requires users.update. */
  @Patch(':id')
  update(@Param('id') id: string, @Body() data: UpdateUserDto, @Request() req) {
    const isSelf = id === req.user.id;
    const canManage = (req.user.permissions as string[]).map(normalizePermission).includes('users.update');
    if (!isSelf && !canManage) throw new ForbiddenException('Insufficient permissions');
    return this.usersService.update(id, data, req.user);
  }

  @Put(':id/roles')
  @Permissions('users.update')
  setRoles(@Param('id') id: string, @Body() body: SetRolesDto, @Request() req) {
    return this.usersService.setRoles(id, body.roleIds, req.user);
  }

  @Patch(':id/branch')
  @Permissions('users.update')
  moveBranch(@Param('id') id: string, @Body() body: MoveBranchDto, @Request() req) {
    return this.usersService.moveBranch(id, body.branchId, req.user);
  }

  @Patch(':id/deactivate')
  @HttpCode(200)
  @Permissions('users.deactivate')
  deactivate(@Param('id') id: string, @Request() req) {
    return this.usersService.deactivate(id, req.user);
  }

  @Patch(':id/activate')
  @HttpCode(200)
  @Permissions('users.deactivate')
  activate(@Param('id') id: string, @Request() req) {
    return this.usersService.activate(id, req.user);
  }

  /** Backwards-compatible alias for deactivation (users are never hard-deleted). */
  @Delete(':id')
  @Permissions('users.deactivate')
  remove(@Param('id') id: string, @Request() req) {
    return this.usersService.deactivate(id, req.user);
  }
}
