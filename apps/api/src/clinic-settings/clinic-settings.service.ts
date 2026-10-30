import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { assertUuid } from '../common/validation/uuid';
import { pageArgs, paginated } from '../common/pagination';
import {
  CreateClinicServiceDto,
  CreateHolidayDto,
  ListHolidaysQueryDto,
  ListServicesQueryDto,
  PutWorkingHoursDto,
  UpdateClinicServiceDto,
  UpdateHolidayDto,
} from './dto';
import { dateOnlyToUtc, isValidDateOnly, toMinutes } from './timezone';
import type { ReqUser } from './request-user';

@Injectable()
export class ClinicSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- services
  async listServices(user: ReqUser, q: ListServicesQueryDto) {
    const { page, limit, skip, take } = pageArgs(q);
    const where: Prisma.ClinicServiceWhereInput = {
      organizationId: user.organizationId,
      status: q.includeInactive === 'true' ? { not: 'ARCHIVED' } : 'ACTIVE',
      ...(q.departmentId ? { departmentId: q.departmentId } : {}),
      ...(q.search ? { name: { contains: q.search, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.clinicService.findMany({ where, orderBy: { name: 'asc' }, skip, take }),
      this.prisma.clinicService.count({ where }),
    ]);
    return paginated(items, total, page, limit);
  }

  async getService(user: ReqUser, id: string) {
    assertUuid(id, 'id');
    const row = await this.prisma.clinicService.findFirst({
      where: { id, organizationId: user.organizationId, status: { not: 'ARCHIVED' } },
    });
    if (!row) throw new NotFoundException('Service not found');
    return row;
  }

  private async assertDepartment(user: ReqUser, departmentId: string) {
    const dep = await this.prisma.department.findFirst({
      where: { id: departmentId, organizationId: user.organizationId, status: { not: 'ARCHIVED' } },
      select: { id: true },
    });
    if (!dep) throw new NotFoundException('Department not found');
  }

  async createService(user: ReqUser, dto: CreateClinicServiceDto) {
    if (dto.departmentId) await this.assertDepartment(user, dto.departmentId);
    await this.assertUniqueServiceName(user, dto.name);
    const row = await this.prisma.clinicService.create({
      data: {
        organizationId: user.organizationId,
        name: dto.name.trim(),
        description: dto.description,
        duration: dto.duration ?? 15,
        price: new Prisma.Decimal(dto.price),
        departmentId: dto.departmentId ?? null,
      },
    });
    return row;
  }

  async updateService(user: ReqUser, id: string, dto: UpdateClinicServiceDto) {
    const existing = await this.getService(user, id);
    if (dto.departmentId) await this.assertDepartment(user, dto.departmentId);
    if (dto.name && dto.name.trim().toLowerCase() !== existing.name.toLowerCase()) {
      await this.assertUniqueServiceName(user, dto.name, id);
    }
    return this.prisma.clinicService.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.duration !== undefined ? { duration: dto.duration } : {}),
        ...(dto.price !== undefined ? { price: new Prisma.Decimal(dto.price) } : {}),
        ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
  }

  /** Archives (soft delete) so historical invoice items keep their reference. */
  async archiveService(user: ReqUser, id: string) {
    const existing = await this.getService(user, id);
    return this.prisma.clinicService.update({ where: { id: existing.id }, data: { status: 'ARCHIVED' } });
  }

  private async assertUniqueServiceName(user: ReqUser, name: string, exceptId?: string) {
    const dup = await this.prisma.clinicService.findFirst({
      where: {
        organizationId: user.organizationId,
        status: { not: 'ARCHIVED' },
        name: { equals: name.trim(), mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (dup) throw new ConflictException(`A service named "${name.trim()}" already exists`);
  }

  // ----------------------------------------------------------- working hours
  /** Working hours of the active branch, one row per open weekday (0 = Sunday). */
  async getWorkingHours(user: ReqUser) {
    return this.prisma.workingHour.findMany({
      where: { organizationId: user.organizationId, branchId: user.branchId },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  /**
   * Replaces the active branch's weekly hours. Days omitted or marked `closed`
   * are closed. Sending an empty list removes all hours (no restriction).
   */
  async putWorkingHours(user: ReqUser, dto: PutWorkingHoursDto) {
    const seen = new Set<number>();
    const rows: Prisma.WorkingHourCreateManyInput[] = [];
    for (const d of dto.days) {
      if (seen.has(d.dayOfWeek)) throw new BadRequestException(`dayOfWeek ${d.dayOfWeek} is listed twice`);
      seen.add(d.dayOfWeek);
      if (d.closed) continue;
      if (!d.openTime || !d.closeTime) {
        throw new BadRequestException(`openTime and closeTime are required for open day ${d.dayOfWeek}`);
      }
      if (toMinutes(d.openTime) >= toMinutes(d.closeTime)) {
        throw new BadRequestException(`openTime must be before closeTime (day ${d.dayOfWeek})`);
      }
      if (!!d.breakStart !== !!d.breakEnd) {
        throw new BadRequestException(`breakStart and breakEnd must be given together (day ${d.dayOfWeek})`);
      }
      if (d.breakStart && d.breakEnd) {
        const bs = toMinutes(d.breakStart);
        const be = toMinutes(d.breakEnd);
        if (bs >= be || bs < toMinutes(d.openTime) || be > toMinutes(d.closeTime)) {
          throw new BadRequestException(`Break must lie within opening hours (day ${d.dayOfWeek})`);
        }
      }
      rows.push({
        organizationId: user.organizationId,
        branchId: user.branchId,
        dayOfWeek: d.dayOfWeek,
        openTime: d.openTime,
        closeTime: d.closeTime,
        breakStart: d.breakStart ?? null,
        breakEnd: d.breakEnd ?? null,
      });
    }
    const before = await this.getWorkingHours(user);
    await this.prisma.$transaction([
      this.prisma.workingHour.deleteMany({ where: { organizationId: user.organizationId, branchId: user.branchId } }),
      this.prisma.workingHour.createMany({ data: rows }),
    ]);
    const after = await this.getWorkingHours(user);
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'UPDATE',
      resource: 'working_hours',
      resourceId: user.branchId,
      beforeData: before,
      afterData: after,
    });
    return after;
  }

  // ---------------------------------------------------------------- holidays
  /** Holidays are organization-wide (the schema has no branch column). */
  async listHolidays(user: ReqUser, q: ListHolidaysQueryDto) {
    const date: Prisma.DateTimeFilter = {};
    if (q.from) date.gte = this.parseDate(q.from, 'from');
    if (q.to) date.lte = this.parseDate(q.to, 'to');
    return this.prisma.clinicHoliday.findMany({
      where: { organizationId: user.organizationId, ...(q.from || q.to ? { date } : {}) },
      orderBy: { date: 'asc' },
    });
  }

  private parseDate(value: string, name: string) {
    if (!isValidDateOnly(value)) throw new BadRequestException(`${name} must be a valid YYYY-MM-DD date`);
    return dateOnlyToUtc(value);
  }

  private async getHoliday(user: ReqUser, id: string) {
    assertUuid(id, 'id');
    const row = await this.prisma.clinicHoliday.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!row) throw new NotFoundException('Holiday not found');
    return row;
  }

  async createHoliday(user: ReqUser, dto: CreateHolidayDto) {
    const date = this.parseDate(dto.date, 'date');
    try {
      return await this.prisma.clinicHoliday.create({
        data: { organizationId: user.organizationId, name: dto.name.trim(), date, description: dto.description },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`A holiday already exists on ${dto.date}`);
      }
      throw e;
    }
  }

  async updateHoliday(user: ReqUser, id: string, dto: UpdateHolidayDto) {
    const existing = await this.getHoliday(user, id);
    try {
      return await this.prisma.clinicHoliday.update({
        where: { id: existing.id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.date !== undefined ? { date: this.parseDate(dto.date, 'date') } : {}),
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`A holiday already exists on ${dto.date}`);
      }
      throw e;
    }
  }

  async deleteHoliday(user: ReqUser, id: string) {
    const existing = await this.getHoliday(user, id);
    await this.prisma.clinicHoliday.delete({ where: { id: existing.id } });
    return { id: existing.id, deleted: true };
  }
}
