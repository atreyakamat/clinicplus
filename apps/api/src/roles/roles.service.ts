import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  async create(data: any) {
    return this.prisma.role.create({
      data,
    });
  }

  async findAll(organizationId: string, branchId?: string) {
    return this.prisma.role.findMany({
      where: {
        organizationId,
        branchId: branchId ? branchId : null,
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.role.findUnique({
      where: { id },
    });
  }

  async update(id: string, data: any) {
    return this.prisma.role.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    return this.prisma.role.delete({
      where: { id },
    });
  }
}
