import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { assertUuid } from '../common/validation/uuid';
import type { ReqUser } from '../clinic-settings/request-user';

export class CreateDepartmentDto {
  @IsString() @MinLength(1) @MaxLength(200)
  name: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;
}

export class UpdateDepartmentDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  name?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}

export class ListDepartmentsQueryDto {
  @IsOptional() @IsIn(['true', 'false'])
  includeArchived?: string;
}

/** Departments belong to a branch; every query is scoped to the active branch. */
@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: ReqUser, q: ListDepartmentsQueryDto) {
    return this.prisma.department.findMany({
      where: {
        organizationId: user.organizationId,
        branchId: user.branchId,
        ...(q.includeArchived === 'true' ? {} : { status: { not: 'ARCHIVED' } }),
      },
      orderBy: { name: 'asc' },
    });
  }

  async get(user: ReqUser, id: string) {
    assertUuid(id, 'id');
    const row = await this.prisma.department.findFirst({
      where: { id, organizationId: user.organizationId, branchId: user.branchId },
    });
    if (!row) throw new NotFoundException('Department not found');
    return row;
  }

  async create(user: ReqUser, dto: CreateDepartmentDto) {
    await this.assertUnique(user, dto.name);
    return this.prisma.department.create({
      data: {
        organizationId: user.organizationId,
        branchId: user.branchId,
        name: dto.name.trim(),
        description: dto.description,
        createdBy: user.id,
      },
    });
  }

  async update(user: ReqUser, id: string, dto: UpdateDepartmentDto) {
    const existing = await this.get(user, id);
    if (dto.name && dto.name.trim().toLowerCase() !== existing.name.toLowerCase()) {
      await this.assertUnique(user, dto.name, id);
    }
    return this.prisma.department.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.status ? { status: dto.status, deletedAt: null, deletedBy: null } : {}),
        updatedBy: user.id,
      },
    });
  }

  async archive(user: ReqUser, id: string) {
    const existing = await this.get(user, id);
    return this.prisma.department.update({
      where: { id: existing.id },
      data: { status: 'ARCHIVED', deletedAt: new Date(), deletedBy: user.id },
    });
  }

  private async assertUnique(user: ReqUser, name: string, exceptId?: string) {
    const where: Prisma.DepartmentWhereInput = {
      organizationId: user.organizationId,
      branchId: user.branchId,
      status: { not: 'ARCHIVED' },
      name: { equals: name.trim(), mode: 'insensitive' },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    };
    if (await this.prisma.department.findFirst({ where, select: { id: true } })) {
      throw new ConflictException(`A department named "${name.trim()}" already exists in this branch`);
    }
  }
}
