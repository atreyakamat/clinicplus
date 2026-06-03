import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { faker } from '@faker-js/faker';

@Injectable()
export class StaffInvitationsService {
  constructor(private prisma: PrismaService) {}

  async create(data: { email: string; phone?: string; roleId: string; organizationId: string; branchId: string }) {
    const existingUser = await this.prisma.user.findFirst({
      where: { email: data.email, organizationId: data.organizationId },
    });

    if (existingUser) {
      throw new ConflictException('User already belongs to this organization');
    }

    const token = faker.string.uuid();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    return this.prisma.staffInvitation.create({
      data: {
        email: data.email,
        phone: data.phone,
        roleId: data.roleId,
        organizationId: data.organizationId,
        token,
        expiresAt,
      },
    });
  }

  async findAll(organizationId: string) {
    return this.prisma.staffInvitation.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByToken(token: string) {
    const invitation = await this.prisma.staffInvitation.findUnique({
      where: { token },
      include: { organization: true },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.expiresAt < new Date()) {
      throw new ConflictException('Invitation has expired');
    }

    return invitation;
  }

  async accept(token: string, userData: { firstName: string; lastName: string; passwordHash: string }) {
    const invitation = await this.findByToken(token);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          organizationId: invitation.organizationId,
          branchId: (await tx.branch.findFirst({ where: { organizationId: invitation.organizationId } }))?.id || '',
          email: invitation.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          passwordHash: userData.passwordHash,
        },
      });

      await tx.userRole.create({
        data: {
          organizationId: invitation.organizationId,
          branchId: user.branchId,
          userId: user.id,
          roleId: invitation.roleId,
        },
      });

      await tx.staffInvitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED' },
      });

      return user;
    });
  }
}
