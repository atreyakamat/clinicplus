import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { DoctorsService } from './doctors.service';
import {
  AvailabilityBlockDto,
  CreateLeaveDto,
  ListDoctorsQueryDto,
  ListLeavesQueryDto,
  PutAvailabilityDto,
  SlotsQueryDto,
  UpdateAvailabilityBlockDto,
  UpdateDoctorProfileDto,
  UpdateLeaveDto,
} from './dto';

/**
 * Write handlers require `doctors.view` at the guard (held by everyone who may
 * edit doctors) and then enforce, in DoctorsService.assertCanManage, either
 * `doctors.manage` or `doctors.update_own` on the caller's own record.
 */
@Controller('api/v1/doctors')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class DoctorsController {
  constructor(private readonly doctors: DoctorsService) {}

  @Get()
  @Permissions('doctors.view')
  list(@Request() req, @Query() q: ListDoctorsQueryDto) {
    return this.doctors.list(req.user, q);
  }

  @Get(':id')
  @Permissions('doctors.view')
  get(@Request() req, @Param('id') id: string) {
    return this.doctors.get(req.user, id);
  }

  @Patch(':id')
  @Permissions('doctors.view')
  updateProfile(@Request() req, @Param('id') id: string, @Body() dto: UpdateDoctorProfileDto) {
    return this.doctors.updateProfile(req.user, id, dto);
  }

  @Get(':id/slots')
  @Permissions('doctors.view')
  slots(@Request() req, @Param('id') id: string, @Query() q: SlotsQueryDto) {
    return this.doctors.slots(req.user, id, q);
  }

  @Get(':id/availability')
  @Permissions('doctors.view')
  listAvailability(@Request() req, @Param('id') id: string) {
    return this.doctors.listAvailability(req.user, id);
  }

  @Put(':id/availability')
  @Permissions('doctors.view')
  putAvailability(@Request() req, @Param('id') id: string, @Body() dto: PutAvailabilityDto) {
    return this.doctors.putAvailability(req.user, id, dto);
  }

  @Post(':id/availability')
  @Permissions('doctors.view')
  addAvailability(@Request() req, @Param('id') id: string, @Body() dto: AvailabilityBlockDto) {
    return this.doctors.addAvailability(req.user, id, dto);
  }

  @Patch(':id/availability/:blockId')
  @Permissions('doctors.view')
  updateAvailability(
    @Request() req,
    @Param('id') id: string,
    @Param('blockId') blockId: string,
    @Body() dto: UpdateAvailabilityBlockDto,
  ) {
    return this.doctors.updateAvailability(req.user, id, blockId, dto);
  }

  @Delete(':id/availability/:blockId')
  @Permissions('doctors.view')
  deleteAvailability(@Request() req, @Param('id') id: string, @Param('blockId') blockId: string) {
    return this.doctors.deleteAvailability(req.user, id, blockId);
  }

  @Get(':id/leaves')
  @Permissions('doctors.view')
  listLeaves(@Request() req, @Param('id') id: string, @Query() q: ListLeavesQueryDto) {
    return this.doctors.listLeaves(req.user, id, q);
  }

  @Post(':id/leaves')
  @Permissions('doctors.view')
  createLeave(@Request() req, @Param('id') id: string, @Body() dto: CreateLeaveDto) {
    return this.doctors.createLeave(req.user, id, dto);
  }

  @Patch(':id/leaves/:leaveId')
  @Permissions('doctors.view')
  updateLeave(@Request() req, @Param('id') id: string, @Param('leaveId') leaveId: string, @Body() dto: UpdateLeaveDto) {
    return this.doctors.updateLeave(req.user, id, leaveId, dto);
  }

  @Delete(':id/leaves/:leaveId')
  @Permissions('doctors.view')
  deleteLeave(@Request() req, @Param('id') id: string, @Param('leaveId') leaveId: string) {
    return this.doctors.deleteLeave(req.user, id, leaveId);
  }
}
