import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { ClinicSettingsService } from './clinic-settings.service';
import {
  CreateClinicServiceDto,
  CreateHolidayDto,
  ListHolidaysQueryDto,
  ListServicesQueryDto,
  PutWorkingHoursDto,
  UpdateClinicServiceDto,
  UpdateHolidayDto,
} from './dto';

/**
 * Clinic configuration: service / price catalog (org-wide), weekly working
 * hours (per active branch) and holidays (org-wide).
 */
@Controller('api/v1/clinic-settings')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ClinicSettingsController {
  constructor(private readonly service: ClinicSettingsService) {}

  @Get('services')
  @Permissions('services.view')
  listServices(@Request() req, @Query() q: ListServicesQueryDto) {
    return this.service.listServices(req.user, q);
  }

  @Get('services/:id')
  @Permissions('services.view')
  getService(@Request() req, @Param('id') id: string) {
    return this.service.getService(req.user, id);
  }

  @Post('services')
  @Permissions('services.manage')
  createService(@Request() req, @Body() dto: CreateClinicServiceDto) {
    return this.service.createService(req.user, dto);
  }

  @Patch('services/:id')
  @Permissions('services.manage')
  updateService(@Request() req, @Param('id') id: string, @Body() dto: UpdateClinicServiceDto) {
    return this.service.updateService(req.user, id, dto);
  }

  @Delete('services/:id')
  @Permissions('services.manage')
  archiveService(@Request() req, @Param('id') id: string) {
    return this.service.archiveService(req.user, id);
  }

  @Get('working-hours')
  @Permissions('services.view')
  getWorkingHours(@Request() req) {
    return this.service.getWorkingHours(req.user);
  }

  @Put('working-hours')
  @Permissions('services.manage')
  putWorkingHours(@Request() req, @Body() dto: PutWorkingHoursDto) {
    return this.service.putWorkingHours(req.user, dto);
  }

  @Get('holidays')
  @Permissions('services.view')
  listHolidays(@Request() req, @Query() q: ListHolidaysQueryDto) {
    return this.service.listHolidays(req.user, q);
  }

  @Post('holidays')
  @Permissions('services.manage')
  createHoliday(@Request() req, @Body() dto: CreateHolidayDto) {
    return this.service.createHoliday(req.user, dto);
  }

  @Patch('holidays/:id')
  @Permissions('services.manage')
  updateHoliday(@Request() req, @Param('id') id: string, @Body() dto: UpdateHolidayDto) {
    return this.service.updateHoliday(req.user, id, dto);
  }

  @Delete('holidays/:id')
  @Permissions('services.manage')
  deleteHoliday(@Request() req, @Param('id') id: string) {
    return this.service.deleteHoliday(req.user, id);
  }
}
