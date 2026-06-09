import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

  async findOne(id: string, organizationId?: string) {
    const targetId = organizationId ?? id;

    if (organizationId && id !== organizationId) {
      throw new NotFoundException('Organization not found');
    }

    const org = await this.prisma.organization.findFirst({
      where: {
        id: targetId,
      },
      include: { branches: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async update(id: string, data: any, organizationId?: string) {
    await this.findOne(id, organizationId);
    return this.prisma.organization.update({
      where: { id },
      data,
    });
  }
}
