import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TimelineService } from '../timeline/timeline.service';
import { AuditService } from '../common/services/audit.service';
import { pageArgs, paginated } from '../common/pagination';
import { assertUuid } from '../common/validation/uuid';
import { RequestUser, hasClinicalAccess, userCan } from '../clinical/clinical-access';
import { withBmi } from '../consultations/consultation-rules';
import { CreatePatientDto, EmergencyContactDto, PatientAddressDto, PatientTagDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { DuplicateCheckQueryDto, ListPatientsQueryDto } from './dto/patient-query.dto';
import { ArchivePatientDto, FamilyMemberDto, PatientNoteDto } from './dto/patient-subresources.dto';

const OUTSTANDING_STATUSES = ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] as const;
const VISIT_STATUSES = ['CHECKED_IN', 'IN_PROGRESS', 'COMPLETED'] as const;
const UPCOMING_STATUSES = ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN'] as const;
const OPEN_FOLLOW_UP: Prisma.FollowUpWhereInput = {
  OR: [{ status: null }, { status: { notIn: ['COMPLETED', 'CANCELLED', 'CLOSED', 'MISSED'] } }],
};

const relatedSelect = { id: true, firstName: true, lastName: true, patientCode: true, phone: true };

@Injectable()
export class PatientsService {
  constructor(
    private prisma: PrismaService,
    private timeline: TimelineService,
    private auditService: AuditService,
  ) {}

  // ------------------------------------------------------------------ helpers

  /** Patient of the caller's organization and active branch (archived included), or 404. */
  private async load(id: string, user: RequestUser) {
    assertUuid(id, 'patientId');
    const patient = await this.prisma.patient.findFirst({
      where: { id, organizationId: user.organizationId, branchId: user.branchId },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  private async loadActive(id: string, user: RequestUser) {
    const p = await this.load(id, user);
    if (p.status === 'ARCHIVED') throw new ConflictException('Patient is archived; restore the record first');
    return p;
  }

  private async findDuplicates(
    organizationId: string,
    c: { phone?: string; email?: string; firstName?: string; lastName?: string; dateOfBirth?: string },
    excludeId?: string,
  ) {
    const or: Prisma.PatientWhereInput[] = [];
    if (c.phone) or.push({ phone: c.phone.trim() });
    if (c.email) or.push({ email: { equals: c.email.trim(), mode: 'insensitive' } });
    if (c.firstName && c.lastName && c.dateOfBirth) {
      or.push({
        firstName: { equals: c.firstName.trim(), mode: 'insensitive' },
        lastName: { equals: c.lastName.trim(), mode: 'insensitive' },
        dateOfBirth: new Date(c.dateOfBirth),
      });
    }
    if (!or.length) return [];
    return this.prisma.patient.findMany({
      where: {
        organizationId,
        status: { not: 'ARCHIVED' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
        OR: or,
      },
      select: { ...relatedSelect, email: true, dateOfBirth: true, branchId: true },
      take: 5,
    });
  }

  private async nextPatientCode(organizationId: string, tx: Prisma.TransactionClient) {
    // Serialise allocation per org until this transaction commits, so concurrent
    // registrations never read the same "last code" and collide.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'patient-code:' + organizationId}))`;
    const last = await tx.patient.findFirst({
      where: { organizationId, patientCode: { startsWith: 'PAT-' } },
      orderBy: { patientCode: 'desc' },
      select: { patientCode: true },
    });
    const n = last?.patientCode ? parseInt(last.patientCode.slice(4), 10) || 0 : 0;
    return `PAT-${(n + 1).toString().padStart(6, '0')}`;
  }

  private demographics(dto: Partial<CreatePatientDto & UpdatePatientDto>) {
    const d: Prisma.PatientUncheckedUpdateInput = {};
    const keys = [
      'firstName',
      'middleName',
      'lastName',
      'gender',
      'phone',
      'email',
      'bloodGroup',
      'maritalStatus',
      'occupation',
      'abhaNumber',
      'communicationOptIn',
      'preferredChannel',
    ] as const;
    for (const k of keys) {
      const v = dto[k];
      if (v !== undefined) (d as any)[k] = typeof v === 'string' ? v.trim() : v;
    }
    if (dto.dateOfBirth !== undefined) {
      const dob = new Date(dto.dateOfBirth);
      if (dob.getTime() > Date.now()) throw new BadRequestException('dateOfBirth cannot be in the future');
      d.dateOfBirth = dob;
    }
    return d;
  }

  // -------------------------------------------------------------------- CRUD

  async create(dto: CreatePatientDto, user: RequestUser) {
    const dupes = await this.findDuplicates(user.organizationId, dto);
    if (dupes.length) {
      const emailClash = dto.email && dupes.some((d) => d.email?.toLowerCase() === dto.email!.toLowerCase());
      if (!dto.allowDuplicate || emailClash) {
        const d = dupes[0];
        throw new ConflictException(
          `Possible duplicate: ${d.firstName} ${d.lastName} (${d.patientCode ?? d.id}) has the same ${
            emailClash ? 'email' : dto.phone && d.phone === dto.phone.trim() ? 'phone' : 'name and date of birth'
          }${emailClash ? '' : '. Confirm to register anyway (allowDuplicate=true)'}`,
        );
      }
    }

    for (let attempt = 0; ; attempt++) {
      try {
        const patient = await this.prisma.$transaction(async (tx) => {
          const patientCode = dto.patientCode?.trim() || (await this.nextPatientCode(user.organizationId, tx));
          const created = await tx.patient.create({
            data: {
              ...(this.demographics(dto) as Prisma.PatientUncheckedCreateInput),
              firstName: dto.firstName.trim(),
              lastName: dto.lastName.trim(),
              organizationId: user.organizationId,
              branchId: user.branchId,
              patientCode,
              createdBy: user.id,
            },
          });
          const scope = { organizationId: user.organizationId, branchId: user.branchId, patientId: created.id };
          if (dto.addresses?.length) {
            await tx.patientAddress.createMany({ data: dto.addresses.map((a) => ({ ...scope, ...a })) });
          }
          if (dto.emergencyContacts?.length) {
            await tx.patientEmergencyContact.createMany({ data: dto.emergencyContacts.map((c) => ({ ...scope, ...c })) });
          }
          if (dto.tags?.length) {
            const unique = [...new Map(dto.tags.map((t) => [t.tagName.trim().toLowerCase(), t])).values()];
            await tx.patientTag.createMany({
              data: unique.map((t) => ({ ...scope, tagName: t.tagName.trim(), tagColor: t.tagColor })),
            });
          }
          await this.timeline.emit(
            'PATIENT_REGISTERED',
            {
              organizationId: user.organizationId,
              patientId: created.id,
              title: 'Patient registered',
              description: `${created.firstName} ${created.lastName} (${created.patientCode}) was registered.`,
              createdBy: user.id,
            },
            tx,
          );
          return created;
        });
        await this.auditService.log({
          organizationId: user.organizationId,
          userId: user.id,
          action: 'CREATE',
          resource: 'patient',
          resourceId: patient.id,
          afterData: patient,
        });
        return patient;
      } catch (err) {
        const isCodeClash =
          err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && !dto.patientCode && attempt < 4;
        if (isCodeClash) continue;
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ConflictException('Patient code already in use');
        }
        throw err;
      }
    }
  }

  async checkDuplicates(q: DuplicateCheckQueryDto, user: RequestUser) {
    return this.findDuplicates(user.organizationId, q, q.excludeId);
  }

  private listWhere(user: RequestUser, q: ListPatientsQueryDto): Prisma.PatientWhereInput {
    const term = q.q?.trim();
    return {
      organizationId: user.organizationId,
      branchId: user.branchId,
      ...(q.status ? { status: q.status } : { status: { not: 'ARCHIVED' } }),
      ...(q.gender ? { gender: q.gender } : {}),
      ...(q.bloodGroup ? { bloodGroup: q.bloodGroup } : {}),
      ...(q.tag ? { tags: { some: { tagName: { equals: q.tag, mode: 'insensitive' } } } } : {}),
      ...(term ? { OR: this.searchOr(term) } : {}),
    };
  }

  private searchOr(term: string): Prisma.PatientWhereInput[] {
    const parts = term.split(/\s+/).filter(Boolean);
    const or: Prisma.PatientWhereInput[] = [
      { firstName: { contains: term, mode: 'insensitive' } },
      { lastName: { contains: term, mode: 'insensitive' } },
      { phone: { contains: term.replace(/[\s-]/g, '') } },
      { patientCode: { contains: term, mode: 'insensitive' } },
      { email: { contains: term, mode: 'insensitive' } },
      { abhaNumber: { contains: term } },
    ];
    if (parts.length >= 2) {
      or.push({
        firstName: { contains: parts[0], mode: 'insensitive' },
        lastName: { contains: parts.slice(1).join(' '), mode: 'insensitive' },
      });
    }
    return or;
  }

  async findAll(user: RequestUser, q: ListPatientsQueryDto) {
    const { page, limit, skip, take } = pageArgs(q);
    const where = this.listWhere(user, q);
    const dir = q.sortDir ?? (q.sortBy === 'name' || q.sortBy === 'patientCode' ? 'asc' : 'desc');
    const orderBy: Prisma.PatientOrderByWithRelationInput[] =
      q.sortBy === 'name'
        ? [{ firstName: dir }, { lastName: dir }]
        : [{ [q.sortBy ?? 'createdAt']: dir } as Prisma.PatientOrderByWithRelationInput];
    const [items, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        orderBy,
        skip,
        take,
        include: { tags: { select: { id: true, tagName: true, tagColor: true } } },
      }),
      this.prisma.patient.count({ where }),
    ]);
    return paginated(items, total, page, limit);
  }

  /** Unpaginated rows for CSV export (capped). */
  async exportRows(user: RequestUser, q: ListPatientsQueryDto) {
    return this.prisma.patient.findMany({
      where: this.listWhere(user, q),
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });
  }

  async distinctTags(user: RequestUser) {
    const rows = await this.prisma.patientTag.groupBy({
      by: ['tagName'],
      where: { organizationId: user.organizationId, branchId: user.branchId },
      _count: { tagName: true },
      orderBy: { tagName: 'asc' },
    });
    return rows.map((r) => ({ tagName: r.tagName, count: r._count.tagName }));
  }

  /** Global search: top matches enriched with last visit, next appointment, follow-ups and balance (per permission). */
  async search(user: RequestUser, rawTerm: string) {
    const term = rawTerm.trim();
    if (term.length < 2) return [];
    const patients = await this.prisma.patient.findMany({
      where: {
        organizationId: user.organizationId,
        branchId: user.branchId,
        status: { not: 'ARCHIVED' },
        OR: this.searchOr(term),
      },
      select: {
        ...relatedSelect,
        email: true,
        gender: true,
        dateOfBirth: true,
        status: true,
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 10,
    });
    if (!patients.length) return [];
    const ids = patients.map((p) => p.id);
    const [lastVisits, followUps, balances, nextAppts] = await Promise.all([
      this.lastVisits(ids, user.organizationId),
      userCan(user, 'follow_ups.view')
        ? this.prisma.followUp.groupBy({
            by: ['patientId'],
            where: { organizationId: user.organizationId, patientId: { in: ids }, ...OPEN_FOLLOW_UP },
            _count: { _all: true },
          })
        : Promise.resolve(null),
      userCan(user, 'invoices.view') ? this.outstandingByPatient(ids, user.organizationId) : Promise.resolve(null),
      userCan(user, 'appointments.view')
        ? this.prisma.appointment.groupBy({
            by: ['patientId'],
            where: {
              organizationId: user.organizationId,
              patientId: { in: ids },
              status: { in: [...UPCOMING_STATUSES] },
              scheduledStart: { gte: new Date() },
            },
            _min: { scheduledStart: true },
          })
        : Promise.resolve(null),
    ]);
    return patients.map((p) => ({
      ...p,
      lastVisit: lastVisits.get(p.id) ?? null,
      ...(followUps ? { pendingFollowUps: followUps.find((f) => f.patientId === p.id)?._count._all ?? 0 } : {}),
      ...(balances ? { outstandingBalance: (balances.get(p.id) ?? new Prisma.Decimal(0)).toFixed(2) } : {}),
      ...(nextAppts ? { nextAppointment: nextAppts.find((a) => a.patientId === p.id)?._min.scheduledStart ?? null } : {}),
    }));
  }

  private async lastVisits(ids: string[], organizationId: string) {
    const [appts, consults] = await Promise.all([
      this.prisma.appointment.groupBy({
        by: ['patientId'],
        where: {
          organizationId,
          patientId: { in: ids },
          status: { in: [...VISIT_STATUSES] },
          scheduledStart: { lte: new Date() },
        },
        _max: { scheduledStart: true },
      }),
      this.prisma.consultation.groupBy({
        by: ['patientId'],
        where: { organizationId, patientId: { in: ids }, deletedAt: null },
        _max: { consultationDate: true },
      }),
    ]);
    const out = new Map<string, Date>();
    for (const a of appts) if (a._max.scheduledStart) out.set(a.patientId, a._max.scheduledStart);
    for (const c of consults) {
      const d = c._max.consultationDate;
      if (d && (!out.get(c.patientId) || d > out.get(c.patientId)!)) out.set(c.patientId, d);
    }
    return out;
  }

  private async outstandingInvoices(patientIds: string[], organizationId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        patientId: { in: patientIds },
        status: { in: [...OUTSTANDING_STATUSES] },
        deletedAt: null,
      },
      select: {
        id: true,
        patientId: true,
        invoiceNumber: true,
        total: true,
        status: true,
        dueDate: true,
        createdAt: true,
        payments: { select: { amount: true, paymentStatus: true, isRefund: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return invoices.map(({ payments, ...inv }) => {
      const paid = payments
        .filter((p) => p.paymentStatus === 'PAID' && !p.isRefund)
        .reduce((s, p) => s.plus(p.amount), new Prisma.Decimal(0));
      const due = Prisma.Decimal.max(new Prisma.Decimal(inv.total).minus(paid), new Prisma.Decimal(0));
      return { ...inv, paid: paid.toFixed(2), balanceDue: due };
    });
  }

  private async outstandingByPatient(patientIds: string[], organizationId: string) {
    const out = new Map<string, Prisma.Decimal>();
    for (const inv of await this.outstandingInvoices(patientIds, organizationId)) {
      out.set(inv.patientId, (out.get(inv.patientId) ?? new Prisma.Decimal(0)).plus(inv.balanceDue));
    }
    return out;
  }

  /** Demographics and contact sub-resources (no clinical or financial data). */
  async findOne(id: string, user: RequestUser) {
    await this.load(id, user);
    return this.prisma.patient.findFirst({
      where: { id },
      include: {
        addresses: { orderBy: { createdAt: 'asc' } },
        emergencyContacts: { orderBy: { createdAt: 'asc' } },
        familyMembers: { include: { relatedPatient: { select: relatedSelect } } },
        relatedFamilyMembers: { include: { patient: { select: relatedSelect } } },
        tags: { orderBy: { tagName: 'asc' } },
      },
    });
  }

  /**
   * Patient profile hub: one call for the profile screen. Each section is only
   * present when the caller holds its permission; `sections` lists what was included.
   */
  async summary(id: string, user: RequestUser) {
    const patient = await this.findOne(id, user);
    const org = user.organizationId;
    const now = new Date();
    const clinicalAccess = hasClinicalAccess(user);
    const can = {
      allergies: userCan(user, 'clinical.view'),
      conditions: userCan(user, 'clinical.view'),
      vitals: userCan(user, 'vitals.view'),
      consultations: userCan(user, 'consultations.view'),
      prescriptions: userCan(user, 'prescriptions.view') && clinicalAccess,
      appointments: userCan(user, 'appointments.view'),
      followUps: userCan(user, 'follow_ups.view'),
      billing: userCan(user, 'invoices.view'),
      documents: userCan(user, 'documents.view'),
    };
    const skip = Promise.resolve(undefined);
    const [
      allergies,
      conditions,
      vitals,
      consultations,
      prescriptions,
      appointments,
      followUps,
      invoices,
      documents,
      notes,
      lastVisits,
      visitCount,
    ] = await Promise.all([
      can.allergies ? this.prisma.allergy.findMany({ where: { organizationId: org, patientId: id }, orderBy: { createdAt: 'desc' } }) : skip,
      can.conditions
        ? this.prisma.medicalCondition.findMany({ where: { organizationId: org, patientId: id }, orderBy: { createdAt: 'desc' } })
        : skip,
      can.vitals
        ? this.prisma.vital.findMany({
            where: { organizationId: org, consultation: { patientId: id } },
            orderBy: { createdAt: 'desc' },
            take: 5,
          })
        : skip,
      can.consultations
        ? this.prisma.consultation.findMany({
            where: { organizationId: org, patientId: id, deletedAt: null },
            select: {
              id: true,
              consultationDate: true,
              status: true,
              chiefComplaint: true,
              doctor: { select: { id: true, firstName: true, lastName: true } },
              diagnoses: { select: { id: true, diagnosisName: true, icdCode: true } },
            },
            orderBy: { consultationDate: 'desc' },
            take: 5,
          })
        : skip,
      can.prescriptions
        ? this.prisma.prescription.findMany({
            where: { organizationId: org, patientId: id, status: 'ACTIVE' },
            include: { items: true, doctor: { select: { id: true, firstName: true, lastName: true } } },
            orderBy: { issuedAt: 'desc' },
          })
        : skip,
      can.appointments
        ? this.prisma.appointment.findMany({
            where: {
              organizationId: org,
              patientId: id,
              scheduledStart: { gte: now },
              status: { in: [...UPCOMING_STATUSES] },
            },
            select: {
              id: true,
              scheduledStart: true,
              scheduledEnd: true,
              status: true,
              appointmentType: true,
              doctor: { select: { id: true, firstName: true, lastName: true } },
            },
            orderBy: { scheduledStart: 'asc' },
            take: 5,
          })
        : skip,
      can.followUps
        ? this.prisma.followUp.findMany({
            where: { organizationId: org, patientId: id, ...OPEN_FOLLOW_UP },
            select: { id: true, scheduledDate: true, status: true, reason: true, notes: true },
            orderBy: { scheduledDate: 'asc' },
            take: 10,
          })
        : skip,
      can.billing ? this.outstandingInvoices([id], org) : skip,
      can.documents
        ? this.prisma.medicalDocument.findMany({
            where: { organizationId: org, patientId: id },
            select: { id: true, title: true, documentType: true, mimeType: true, fileSize: true, uploadedAt: true },
            orderBy: { uploadedAt: 'desc' },
            take: 5,
          })
        : skip,
      this.listNotesRaw(id, org, 5),
      this.lastVisits([id], org),
      this.prisma.appointment.count({
        where: { organizationId: org, patientId: id, status: { in: [...VISIT_STATUSES] } },
      }),
    ]);

    const result: Record<string, unknown> = {
      patient,
      stats: { lastVisit: lastVisits.get(id) ?? null, visitCount },
      notes,
    };
    if (allergies) result.allergies = allergies;
    if (conditions) result.conditions = conditions;
    if (vitals) result.recentVitals = vitals.map(withBmi);
    if (consultations) result.recentConsultations = consultations;
    if (prescriptions) result.activePrescriptions = prescriptions;
    if (appointments) result.upcomingAppointments = appointments;
    if (followUps) result.pendingFollowUps = followUps;
    if (invoices) {
      result.outstandingInvoices = invoices.map((i) => ({ ...i, balanceDue: i.balanceDue.toFixed(2) }));
      result.outstandingBalance = invoices.reduce((s, i) => s.plus(i.balanceDue), new Prisma.Decimal(0)).toFixed(2);
    }
    if (documents) result.recentDocuments = documents;
    result.sections = Object.keys(result).filter((k) => !['patient', 'stats', 'notes'].includes(k));
    return result;
  }

  async update(id: string, dto: UpdatePatientDto, user: RequestUser) {
    const before = await this.loadActive(id, user);
    if (dto.phone || dto.email) {
      const dupes = await this.findDuplicates(user.organizationId, { email: dto.email }, id);
      if (dupes.length) {
        throw new ConflictException(`Email already belongs to ${dupes[0].firstName} ${dupes[0].lastName} (${dupes[0].patientCode})`);
      }
    }
    const patient = await this.prisma.patient.update({
      where: { id },
      data: { ...this.demographics(dto), updatedBy: user.id },
    });
    const changed = Object.keys(this.demographics(dto)).filter(
      (k) => String((before as any)[k] ?? '') !== String((patient as any)[k] ?? ''),
    );
    if (changed.length) {
      await this.timeline.emit('PATIENT_UPDATED', {
        organizationId: user.organizationId,
        patientId: id,
        title: 'Profile updated',
        description: `Updated: ${changed.join(', ')}`,
        createdBy: user.id,
      });
    }
    await this.auditService.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'UPDATE',
      resource: 'patient',
      resourceId: id,
      beforeData: before,
      afterData: patient,
    });
    return patient;
  }

  /** Soft delete: the record and its history are kept, hidden from lists and blocked for new activity. */
  async archive(id: string, dto: ArchivePatientDto, user: RequestUser) {
    const before = await this.loadActive(id, user);
    const patient = await this.prisma.patient.update({
      where: { id },
      data: { status: 'ARCHIVED', deletedAt: new Date(), deletedBy: user.id, deleteReason: dto.reason },
    });
    await this.timeline.emit('PATIENT_ARCHIVED', {
      organizationId: user.organizationId,
      patientId: id,
      title: 'Patient archived',
      description: dto.reason,
      createdBy: user.id,
    });
    await this.auditService.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'ARCHIVE',
      resource: 'patient',
      resourceId: id,
      beforeData: { status: before.status },
      afterData: { status: patient.status, reason: dto.reason },
    });
    return patient;
  }

  async restore(id: string, user: RequestUser) {
    const before = await this.load(id, user);
    if (before.status !== 'ARCHIVED') throw new ConflictException('Patient is not archived');
    const patient = await this.prisma.patient.update({
      where: { id },
      data: { status: 'ACTIVE', deletedAt: null, deletedBy: null, deleteReason: null, updatedBy: user.id },
    });
    await this.timeline.emit('PATIENT_RESTORED', {
      organizationId: user.organizationId,
      patientId: id,
      title: 'Patient restored',
      createdBy: user.id,
    });
    await this.auditService.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'RESTORE',
      resource: 'patient',
      resourceId: id,
      beforeData: { status: before.status },
      afterData: { status: 'ACTIVE' },
    });
    return patient;
  }

  // ---------------------------------------------------------- sub-resources

  private async subAudit(user: RequestUser, action: string, resource: string, id: string, data?: unknown) {
    await this.auditService.log({
      organizationId: user.organizationId,
      userId: user.id,
      action,
      resource,
      resourceId: id,
      afterData: data,
    });
  }

  async addAddress(patientId: string, dto: PatientAddressDto, user: RequestUser) {
    const p = await this.loadActive(patientId, user);
    const row = await this.prisma.patientAddress.create({
      data: { organizationId: user.organizationId, branchId: p.branchId, patientId, ...dto },
    });
    await this.subAudit(user, 'CREATE', 'patient_address', row.id, row);
    return row;
  }

  async updateAddress(patientId: string, addressId: string, dto: PatientAddressDto, user: RequestUser) {
    await this.loadActive(patientId, user);
    assertUuid(addressId, 'addressId');
    const res = await this.prisma.patientAddress.updateMany({
      where: { id: addressId, patientId, organizationId: user.organizationId },
      data: dto,
    });
    if (!res.count) throw new NotFoundException('Address not found');
    await this.subAudit(user, 'UPDATE', 'patient_address', addressId, dto);
    return this.prisma.patientAddress.findUnique({ where: { id: addressId } });
  }

  async removeAddress(patientId: string, addressId: string, user: RequestUser) {
    await this.loadActive(patientId, user);
    assertUuid(addressId, 'addressId');
    const res = await this.prisma.patientAddress.deleteMany({
      where: { id: addressId, patientId, organizationId: user.organizationId },
    });
    if (!res.count) throw new NotFoundException('Address not found');
    await this.subAudit(user, 'DELETE', 'patient_address', addressId);
    return { id: addressId, deleted: true };
  }

  async addEmergencyContact(patientId: string, dto: EmergencyContactDto, user: RequestUser) {
    const p = await this.loadActive(patientId, user);
    const row = await this.prisma.patientEmergencyContact.create({
      data: { organizationId: user.organizationId, branchId: p.branchId, patientId, ...dto },
    });
    await this.subAudit(user, 'CREATE', 'patient_emergency_contact', row.id, row);
    return row;
  }

  async updateEmergencyContact(patientId: string, contactId: string, dto: EmergencyContactDto, user: RequestUser) {
    await this.loadActive(patientId, user);
    assertUuid(contactId, 'contactId');
    const res = await this.prisma.patientEmergencyContact.updateMany({
      where: { id: contactId, patientId, organizationId: user.organizationId },
      data: dto,
    });
    if (!res.count) throw new NotFoundException('Emergency contact not found');
    await this.subAudit(user, 'UPDATE', 'patient_emergency_contact', contactId, dto);
    return this.prisma.patientEmergencyContact.findUnique({ where: { id: contactId } });
  }

  async removeEmergencyContact(patientId: string, contactId: string, user: RequestUser) {
    await this.loadActive(patientId, user);
    assertUuid(contactId, 'contactId');
    const res = await this.prisma.patientEmergencyContact.deleteMany({
      where: { id: contactId, patientId, organizationId: user.organizationId },
    });
    if (!res.count) throw new NotFoundException('Emergency contact not found');
    await this.subAudit(user, 'DELETE', 'patient_emergency_contact', contactId);
    return { id: contactId, deleted: true };
  }

  async addFamilyMember(patientId: string, dto: FamilyMemberDto, user: RequestUser) {
    const p = await this.loadActive(patientId, user);
    if (dto.relatedPatientId === patientId) throw new BadRequestException('A patient cannot be linked to themselves');
    await this.loadActive(dto.relatedPatientId, user);
    const existing = await this.prisma.patientFamilyMember.findFirst({
      where: {
        organizationId: user.organizationId,
        OR: [
          { patientId, relatedPatientId: dto.relatedPatientId },
          { patientId: dto.relatedPatientId, relatedPatientId: patientId },
        ],
      },
    });
    if (existing) throw new ConflictException('These patients are already linked');
    const row = await this.prisma.patientFamilyMember.create({
      data: {
        organizationId: user.organizationId,
        branchId: p.branchId,
        patientId,
        relatedPatientId: dto.relatedPatientId,
        relationship: dto.relationship,
      },
      include: { relatedPatient: { select: relatedSelect } },
    });
    await this.subAudit(user, 'CREATE', 'patient_family_member', row.id, dto);
    return row;
  }

  async removeFamilyMember(patientId: string, linkId: string, user: RequestUser) {
    await this.loadActive(patientId, user);
    assertUuid(linkId, 'familyMemberId');
    const res = await this.prisma.patientFamilyMember.deleteMany({
      where: {
        id: linkId,
        organizationId: user.organizationId,
        OR: [{ patientId }, { relatedPatientId: patientId }],
      },
    });
    if (!res.count) throw new NotFoundException('Family link not found');
    await this.subAudit(user, 'DELETE', 'patient_family_member', linkId);
    return { id: linkId, deleted: true };
  }

  async addTag(patientId: string, dto: PatientTagDto, user: RequestUser) {
    const p = await this.loadActive(patientId, user);
    const name = dto.tagName.trim();
    const existing = await this.prisma.patientTag.findFirst({
      where: { patientId, organizationId: user.organizationId, tagName: { equals: name, mode: 'insensitive' } },
    });
    if (existing) return existing;
    const row = await this.prisma.patientTag.create({
      data: { organizationId: user.organizationId, branchId: p.branchId, patientId, tagName: name, tagColor: dto.tagColor },
    });
    await this.subAudit(user, 'CREATE', 'patient_tag', row.id, row);
    return row;
  }

  async removeTag(patientId: string, tagId: string, user: RequestUser) {
    await this.loadActive(patientId, user);
    assertUuid(tagId, 'tagId');
    const res = await this.prisma.patientTag.deleteMany({
      where: { id: tagId, patientId, organizationId: user.organizationId },
    });
    if (!res.count) throw new NotFoundException('Tag not found');
    await this.subAudit(user, 'DELETE', 'patient_tag', tagId);
    return { id: tagId, deleted: true };
  }

  private async listNotesRaw(patientId: string, organizationId: string, take?: number) {
    const notes = await this.prisma.patientNote.findMany({
      where: { patientId, organizationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      ...(take ? { take } : {}),
    });
    const authorIds = [...new Set(notes.map((n) => n.createdBy).filter(Boolean))] as string[];
    const authors = authorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: authorIds }, organizationId },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    return notes.map((n) => ({ ...n, author: authors.find((a) => a.id === n.createdBy) ?? null }));
  }

  async listNotes(patientId: string, user: RequestUser) {
    await this.load(patientId, user);
    return this.listNotesRaw(patientId, user.organizationId);
  }

  async addNote(patientId: string, dto: PatientNoteDto, user: RequestUser) {
    const p = await this.loadActive(patientId, user);
    const note = await this.prisma.patientNote.create({
      data: {
        organizationId: user.organizationId,
        branchId: p.branchId,
        patientId,
        createdBy: user.id,
        note: dto.note.trim(),
      },
    });
    await this.timeline.emit('PATIENT_NOTE_ADDED', {
      organizationId: user.organizationId,
      patientId,
      title: 'Note added',
      metadata: { noteId: note.id },
      createdBy: user.id,
    });
    await this.subAudit(user, 'CREATE', 'patient_note', note.id);
    return note;
  }

  /** Notes are soft-deleted; only the author may remove their note. */
  async removeNote(patientId: string, noteId: string, user: RequestUser) {
    await this.load(patientId, user);
    assertUuid(noteId, 'noteId');
    const note = await this.prisma.patientNote.findFirst({
      where: { id: noteId, patientId, organizationId: user.organizationId, deletedAt: null },
    });
    if (!note) throw new NotFoundException('Note not found');
    if (note.createdBy !== user.id) throw new ForbiddenException('Only the author can delete this note');
    await this.prisma.patientNote.update({ where: { id: noteId }, data: { deletedAt: new Date() } });
    await this.subAudit(user, 'DELETE', 'patient_note', noteId);
    return { id: noteId, deleted: true };
  }
}
