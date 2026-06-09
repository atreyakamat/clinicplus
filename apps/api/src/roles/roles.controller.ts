import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesService } from './roles.service';

@Controller('api/v1/roles')
@UseGuards(JwtAuthGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  findAll(@Request() req) {
    return this.rolesService.findAll(req.user.organizationId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Post()
  create(@Body() data: any, @Request() req) {
    return this.rolesService.create({
      ...data,
      organizationId: req.user.organizationId,
    });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() data: any) {
    return this.rolesService.update(id, data);
  }
}
