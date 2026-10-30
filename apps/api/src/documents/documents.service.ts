import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { TenantAssertService } from '../common/tenant/tenant-assert.service';
import { AuditService } from '../common/services/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { MalwareScannerService } from '../security/malware-scanner.service';
import { detectFileType } from '../common/pipes/file-validation.pipe';
import { pageArgs, paginated } from '../common/pagination';
import { assertUuid } from '../common/validation/uuid';
import { RequestUser } from '../clinical/clinical-access';
import { ListDocumentsQueryDto, UpdateDocumentDto, UploadDocumentDto } from './dto/document.dto';

const LAB = 'LAB_REPORT';
const IMAGING = 'IMAGING';

const listInclude = {
  patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
  uploader: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.MedicalDocumentInclude;

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private tenant: TenantAssertService,
    private audit: AuditService,
    private timeline: TimelineService,
    private scanner: MalwareScannerService,
  ) {}

  /**
   * Stores an uploaded file: tenant checks → malware scan → object storage → DB row
   * (+ LabReport / ImagingReport). Returns only the new document's metadata.
   */
  async upload(file: Express.Multer.File, dto: UploadDocumentDto, user: RequestUser, meta: RequestMeta = {}) {
    const patient = await this.tenant.patient(dto.patientId, user.organizationId, user.branchId);
    if (dto.consultationId) {
      const c = await this.tenant.consultation(dto.consultationId, user.organizationId, user.branchId);
      if (c.patientId !== patient.id) throw new BadRequestException('Consultation does not belong to this patient');
    }
    const detected = detectFileType(file.buffer);
    if (!detected) throw new BadRequestException('Unsupported file type');

    const scan = await this.scanner.scanAndValidate(file);

    const id = randomUUID();
    const storageKey = `org/${user.organizationId}/documents/${randomUUID()}${detected.ext}`;
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    await this.storage.put(storageKey, file.buffer, detected.mime);

    let doc;
    try {
      doc = await this.prisma.$transaction(async (tx) => {
        const created = await tx.medicalDocument.create({
          data: {
            id,
            organizationId: user.organizationId,
            branchId: patient.branchId,
            patientId: patient.id,
            uploadedBy: user.id,
            documentType: dto.documentType,
            title: dto.title.trim(),
            fileUrl: `/api/v1/documents/${id}/download`,
            storageKey,
            checksum,
            mimeType: detected.mime,
            fileSize: file.buffer.length,
          },
        });
        await this.syncReportRows(tx, created, dto.consultationId ?? null, dto.reportDate);
        return created;
      });
    } catch (err) {
      await this.storage.delete(storageKey).catch(() => undefined);
      throw err;
    }

    await this.timeline.emit('DOCUMENT_UPLOADED', {
      organizationId: user.organizationId,
      patientId: patient.id,
      title: `Document uploaded: ${doc.title}`,
      description: dto.documentType.replace(/_/g, ' ').toLowerCase(),
      metadata: { documentId: doc.id, documentType: doc.documentType, consultationId: dto.consultationId ?? null },
      createdBy: user.id,
    });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'UPLOAD',
      resource: 'medical_document',
      resourceId: doc.id,
      afterData: {
        title: doc.title,
        documentType: doc.documentType,
        mimeType: doc.mimeType,
        fileSize: doc.fileSize,
        checksum,
        malwareScan: scan.status,
        originalName: file.originalname,
      },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return {
      id: doc.id,
      patientId: doc.patientId,
      title: doc.title,
      documentType: doc.documentType,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      checksum: doc.checksum,
      uploadedAt: doc.uploadedAt,
      malwareScan: scan.status,
    };
  }

  /** Keeps LabReport / ImagingReport rows in line with the document type. */
  private async syncReportRows(
    tx: Prisma.TransactionClient,
    doc: { id: string; organizationId: string; branchId: string; patientId: string; documentType: string },
    consultationId: string | null,
    reportDate?: string,
  ) {
    const base = {
      organizationId: doc.organizationId,
      branchId: doc.branchId,
      patientId: doc.patientId,
      documentId: doc.id,
      consultationId,
      ...(reportDate ? { reportDate: new Date(reportDate) } : {}),
    };
    if (doc.documentType !== LAB) await tx.labReport.deleteMany({ where: { documentId: doc.id } });
    if (doc.documentType !== IMAGING) await tx.imagingReport.deleteMany({ where: { documentId: doc.id } });
    if (doc.documentType === LAB && !(await tx.labReport.findFirst({ where: { documentId: doc.id } }))) {
      await tx.labReport.create({ data: { ...base, status: 'RECEIVED' } });
    }
    if (doc.documentType === IMAGING && !(await tx.imagingReport.findFirst({ where: { documentId: doc.id } }))) {
      await tx.imagingReport.create({ data: base });
    }
  }

  async findAll(user: RequestUser, q: ListDocumentsQueryDto) {
    const { page, limit, skip, take } = pageArgs(q);
    let consultationFilter: Prisma.MedicalDocumentWhereInput = {};
    if (q.consultationId) {
      consultationFilter = {
        OR: [
          { labReports: { some: { consultationId: q.consultationId } } },
          { imagingReports: { some: { consultationId: q.consultationId } } },
          { id: { in: await this.documentIdsLinkedTo(q.consultationId, user.organizationId) } },
        ],
      };
    }
    const where: Prisma.MedicalDocumentWhereInput = {
      organizationId: user.organizationId,
      branchId: user.branchId,
      ...(q.patientId ? { patientId: q.patientId } : {}),
      ...(q.documentType ? { documentType: q.documentType } : {}),
      ...(q.q ? { title: { contains: q.q, mode: 'insensitive' } } : {}),
      ...consultationFilter,
    };
    const [items, total] = await Promise.all([
      this.prisma.medicalDocument.findMany({
        where,
        include: listInclude,
        orderBy: { uploadedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.medicalDocument.count({ where }),
    ]);
    return paginated(items.map((d) => this.present(d)), total, page, limit);
  }

  /** Documents of other types linked to a consultation through their upload timeline event. */
  private async documentIdsLinkedTo(consultationId: string, organizationId: string): Promise<string[]> {
    assertUuid(consultationId, 'consultationId');
    const events = await this.prisma.timelineEvent.findMany({
      where: {
        organizationId,
        eventType: 'DOCUMENT_UPLOADED',
        metadata: { path: ['consultationId'], equals: consultationId },
      },
      select: { metadata: true },
    });
    return events.map((e) => (e.metadata as any)?.documentId).filter(Boolean);
  }

  private present<T extends { storageKey?: string | null }>(d: T) {
    const { storageKey, ...rest } = d;
    return { ...rest, hasFile: !!storageKey };
  }

  private async load(id: string, user: RequestUser) {
    assertUuid(id, 'documentId');
    const doc = await this.prisma.medicalDocument.findFirst({
      where: { id, organizationId: user.organizationId, branchId: user.branchId },
      include: { ...listInclude, labReports: true, imagingReports: true },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async findOne(id: string, user: RequestUser) {
    return this.present(await this.load(id, user));
  }

  /** Opens the stored object for an authenticated, audited download. */
  async openForDownload(id: string, user: RequestUser, disposition: 'inline' | 'attachment', meta: RequestMeta = {}) {
    const doc = await this.load(id, user);
    if (!doc.storageKey) throw new NotFoundException('This document has no stored file');
    const stream: Readable = await this.storage.getStream(doc.storageKey);
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: disposition === 'inline' ? 'VIEW' : 'DOWNLOAD',
      resource: 'medical_document',
      resourceId: doc.id,
      afterData: { patientId: doc.patientId, title: doc.title },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
    const ext = detectExt(doc.mimeType);
    const safeTitle = doc.title.replace(/[^\w.\- ]+/g, '_').trim() || 'document';
    const filename = safeTitle.toLowerCase().endsWith(ext) ? safeTitle : `${safeTitle}${ext}`;
    return { stream, mimeType: doc.mimeType || 'application/octet-stream', fileSize: doc.fileSize, filename, checksum: doc.checksum };
  }

  async update(id: string, dto: UpdateDocumentDto, user: RequestUser) {
    const before = await this.load(id, user);
    if (dto.consultationId) {
      const c = await this.tenant.consultation(dto.consultationId, user.organizationId, user.branchId);
      if (c.patientId !== before.patientId) throw new BadRequestException('Consultation does not belong to this patient');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.medicalDocument.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.documentType !== undefined ? { documentType: dto.documentType } : {}),
        },
      });
      const consultationId =
        dto.consultationId ?? before.labReports[0]?.consultationId ?? before.imagingReports[0]?.consultationId ?? null;
      await this.syncReportRows(tx, row, consultationId);
      if (dto.consultationId) {
        await tx.labReport.updateMany({ where: { documentId: id }, data: { consultationId: dto.consultationId } });
        await tx.imagingReport.updateMany({ where: { documentId: id }, data: { consultationId: dto.consultationId } });
      }
      return row;
    });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'UPDATE',
      resource: 'medical_document',
      resourceId: id,
      beforeData: { title: before.title, documentType: before.documentType },
      afterData: { title: updated.title, documentType: updated.documentType, consultationId: dto.consultationId },
    });
    return this.present(updated);
  }

  async remove(id: string, user: RequestUser) {
    const doc = await this.load(id, user);
    await this.prisma.$transaction([
      this.prisma.labReport.deleteMany({ where: { documentId: id } }),
      this.prisma.imagingReport.deleteMany({ where: { documentId: id } }),
      this.prisma.medicalDocument.delete({ where: { id } }),
    ]);
    if (doc.storageKey) {
      try {
        await this.storage.delete(doc.storageKey);
      } catch (err) {
        this.logger.error(`Failed to delete stored object ${doc.storageKey}: ${(err as Error).message}`);
      }
    }
    await this.timeline.emit('DOCUMENT_DELETED', {
      organizationId: user.organizationId,
      patientId: doc.patientId,
      title: `Document deleted: ${doc.title}`,
      metadata: { documentId: id },
      createdBy: user.id,
    });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'DELETE',
      resource: 'medical_document',
      resourceId: id,
      beforeData: {
        title: doc.title,
        documentType: doc.documentType,
        patientId: doc.patientId,
        checksum: doc.checksum,
        storageKey: doc.storageKey,
      },
    });
    return { id, deleted: true };
  }
}

function detectExt(mime?: string | null) {
  switch (mime) {
    case 'application/pdf':
      return '.pdf';
    case 'image/png':
      return '.png';
    case 'image/jpeg':
      return '.jpg';
    case 'application/dicom':
      return '.dcm';
    default:
      return '';
  }
}
