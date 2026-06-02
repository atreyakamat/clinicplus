import { Injectable, UseGuards, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(data: {
    organizationId: string;
    userId: string;
    action: string;
    resource: string;
    resourceId?: string;
    oldData?: any;
    newData?: any;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return this.prisma.auditLog.create({
      data: {
        organizationId: data.organizationId,
        actorId: data.userId,
        action: data.action,
        entityType: data.resource,
        entityId: data.resourceId,
        beforeData: data.oldData || undefined,
        afterData: data.newData || undefined,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
    });
  }
}
