import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('api/v1/invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  create(@Body() data: any, @Request() req) {
    data.organizationId = req.user.organizationId;
    data.branchId = req.user.branchId;
    data.createdBy = req.user.id;
    return this.invoicesService.create(data);
  }

  @Get()
  findAll(@Request() req) {
    return this.invoicesService.findAll(req.user.organizationId, req.user.branchId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.invoicesService.findOne(id);
  }

  @Post(':id/payments')
  addPayment(@Param('id') id: string, @Body() data: any, @Request() req) {
    data.organizationId = req.user.organizationId;
    data.branchId = req.user.branchId;
    data.createdBy = req.user.id;
    return this.invoicesService.addPayment(id, data);
  }
}
