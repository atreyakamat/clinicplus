import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.PermissionCreateInput) {
    return this.prisma.permission.create({
      data,
    });
  }

  async findAll(organizationId?: string, branchId?: string) {
    const where: any = {};
    if (organizationId) where.organizationId = organizationId;
    if (branchId) where.branchId = branchId;
    
    return this.prisma.permission.findMany({
      where,
    });
  }

  async findOne(id: string) {
    return this.prisma.permission.findUnique({
      where: { id },
    });
  }

  async update(id: string, data: Prisma.PermissionUpdateInput) {
    return this.prisma.permission.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    return this.prisma.permission.delete({
      where: { id },
    });
  }
}
