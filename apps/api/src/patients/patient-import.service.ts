import { BadRequestException, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { RequestUser } from '../clinical/clinical-access';
import { BLOOD_GROUPS, GENDERS } from './dto/create-patient.dto';

/** Hard ceilings for a single import. */
const MAX_ROWS = 5000;
const PHONE_RE = /^\+?[0-9][0-9\s-]{6,18}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Canonical import columns and the header aliases accepted for each. */
const COLUMN_ALIASES: Record<string, string[]> = {
  firstName: ['firstname', 'first', 'givenname'],
  lastName: ['lastname', 'last', 'surname', 'familyname'],
  gender: ['gender', 'sex'],
  dateOfBirth: ['dateofbirth', 'dob', 'birthdate', 'birthday'],
  phone: ['phone', 'mobile', 'mobilenumber', 'phonenumber', 'contact'],
  email: ['email', 'emailaddress', 'mail'],
  bloodGroup: ['bloodgroup', 'blood'],
  address: ['address', 'addressline1', 'addressline', 'street'],
  city: ['city', 'town'],
  state: ['state', 'province', 'region'],
  country: ['country'],
  postalCode: ['postalcode', 'postcode', 'zip', 'zipcode', 'pincode', 'pin'],
};

const TEMPLATE_HEADERS = [
  'firstName', 'lastName', 'gender', 'dateOfBirth', 'phone', 'email', 'bloodGroup', 'address', 'city', 'state', 'country', 'postalCode',
];

export type RowStatus = 'created' | 'skipped-duplicate' | 'error';

export interface ImportRowResult {
  row: number;
  status: RowStatus;
  message?: string;
  patientCode?: string;
}

export interface ImportResult {
  dryRun: boolean;
  total: number;
  created: number;
  skippedDuplicates: number;
  errors: number;
  rows: ImportRowResult[];
}

interface ParsedRow {
  row: number;
  firstName: string;
  lastName: string;
  gender?: string;
  dateOfBirth?: Date;
  phone?: string;
  email?: string;
  bloodGroup?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

const normHeader = (h: string) => h.toLowerCase().replace(/[\s_\-.]/g, '');

@Injectable()
export class PatientImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** A sample CSV with the supported headers and two example rows. */
  template(): string {
    return stringify(
      [
        ['Asha', 'Rao', 'FEMALE', '1990-04-12', '9876543210', 'asha@example.com', 'O+', '12 MG Road', 'Panaji', 'Goa', 'India', '403001'],
        ['Rahul', 'Kamat', 'MALE', '1985-11-30', '9812345678', '', 'B+', '', 'Margao', 'Goa', 'India', ''],
      ],
      { header: true, columns: TEMPLATE_HEADERS },
    );
  }

  async import(file: Express.Multer.File | undefined, user: RequestUser, dryRun: boolean): Promise<ImportResult> {
    if (!file || !file.buffer || file.size === 0 || file.buffer.length === 0) {
      throw new BadRequestException('No CSV uploaded (multipart field "file")');
    }
    const maxBytes = (Number(process.env.MAX_UPLOAD_MB) || 10) * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new PayloadTooLargeException(`CSV exceeds the ${Math.round(maxBytes / 1024 / 1024)}MB limit`);
    }

    const records = this.parseCsv(file.buffer);
    if (!records.length) throw new BadRequestException('The CSV has no data rows');
    if (records.length > MAX_ROWS) {
      throw new BadRequestException(`Too many rows: ${records.length}. The maximum is ${MAX_ROWS} per import.`);
    }

    const columnMap = this.mapHeaders(Object.keys(records[0] ?? {}));
    if (!columnMap.firstName || !columnMap.lastName) {
      throw new BadRequestException('CSV must include at least "firstName" and "lastName" columns');
    }

    // 1) Parse + validate each row (row numbers are 1-based data rows; header excluded).
    const results: ImportRowResult[] = new Array(records.length);
    const valid: ParsedRow[] = [];
    records.forEach((raw, i) => {
      const rowNo = i + 1;
      const parsed = this.parseRow(raw, columnMap, rowNo);
      if ('error' in parsed) {
        results[i] = { row: rowNo, status: 'error', message: parsed.error };
      } else {
        valid.push(parsed);
      }
    });

    // 2) Duplicate detection against existing org records (same rules as create).
    const existing = await this.loadExistingKeys(user.organizationId, valid);
    const seenPhone = new Set<string>();
    const seenEmail = new Set<string>();
    const seenNameDob = new Set<string>();
    const toCreate: ParsedRow[] = [];
    for (const r of valid) {
      const reason = this.duplicateReason(r, existing, { seenPhone, seenEmail, seenNameDob });
      const idx = r.row - 1;
      if (reason) {
        results[idx] = { row: r.row, status: 'skipped-duplicate', message: reason };
      } else {
        toCreate.push(r);
        if (r.phone) seenPhone.add(r.phone);
        if (r.email) seenEmail.add(r.email.toLowerCase());
        const key = this.nameDobKey(r);
        if (key) seenNameDob.add(key);
      }
    }

    // 3) Insert (unless dry run).
    if (!dryRun && toCreate.length) {
      await this.insert(toCreate, user, results);
    } else {
      for (const r of toCreate) results[r.row - 1] = { row: r.row, status: 'created' };
    }

    const rows = results.filter(Boolean);
    const created = rows.filter((r) => r.status === 'created').length;
    const skippedDuplicates = rows.filter((r) => r.status === 'skipped-duplicate').length;
    const errors = rows.filter((r) => r.status === 'error').length;

    if (!dryRun) {
      await this.audit.log({
        organizationId: user.organizationId,
        userId: user.id,
        action: 'IMPORT',
        resource: 'patient',
        resourceId: user.branchId,
        afterData: { total: rows.length, created, skippedDuplicates, errors },
      });
    }

    return { dryRun, total: rows.length, created, skippedDuplicates, errors, rows };
  }

  // ------------------------------------------------------------------ parsing

  private parseCsv(buffer: Buffer): Record<string, string>[] {
    try {
      return parse(buffer.toString('utf8'), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
        relax_column_count: true,
      }) as Record<string, string>[];
    } catch (err) {
      throw new BadRequestException(`Could not parse CSV: ${(err as Error).message}`);
    }
  }

  private mapHeaders(headers: string[]): Record<string, string> {
    const map: Record<string, string> = {};
    for (const header of headers) {
      const norm = normHeader(header);
      for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
        if (aliases.includes(norm) && !map[canonical]) {
          map[canonical] = header;
          break;
        }
      }
    }
    return map;
  }

  private parseRow(raw: Record<string, string>, map: Record<string, string>, rowNo: number): ParsedRow | { error: string } {
    const get = (key: string) => {
      const col = map[key];
      const v = col ? raw[col] : undefined;
      return typeof v === 'string' ? v.trim() : v ? String(v) : '';
    };

    const firstName = get('firstName');
    const lastName = get('lastName');
    if (!firstName || !lastName) return { error: 'firstName and lastName are required' };
    if (firstName.length > 100 || lastName.length > 100) return { error: 'firstName/lastName exceed 100 characters' };

    const out: ParsedRow = { row: rowNo, firstName, lastName };

    const gender = get('gender');
    if (gender) {
      const g = gender.toUpperCase();
      if (!GENDERS.includes(g)) return { error: `Invalid gender "${gender}" (allowed: ${GENDERS.join(', ')})` };
      out.gender = g;
    }

    const dob = get('dateOfBirth');
    if (dob) {
      const d = this.parseDate(dob);
      if (!d) return { error: `Invalid dateOfBirth "${dob}" (use YYYY-MM-DD)` };
      if (d.getTime() > Date.now()) return { error: 'dateOfBirth cannot be in the future' };
      out.dateOfBirth = d;
    }

    const phone = get('phone');
    if (phone) {
      if (!PHONE_RE.test(phone)) return { error: `Invalid phone "${phone}"` };
      out.phone = phone;
    }

    const email = get('email');
    if (email) {
      if (!EMAIL_RE.test(email)) return { error: `Invalid email "${email}"` };
      out.email = email;
    }

    const bloodGroup = get('bloodGroup');
    if (bloodGroup) {
      const b = bloodGroup.toUpperCase();
      if (!BLOOD_GROUPS.includes(b)) return { error: `Invalid bloodGroup "${bloodGroup}"` };
      out.bloodGroup = b;
    }

    out.address = get('address') || undefined;
    out.city = get('city') || undefined;
    out.state = get('state') || undefined;
    out.country = get('country') || undefined;
    out.postalCode = get('postalCode') || undefined;
    return out;
  }

  /** Accepts ISO (YYYY-MM-DD) and day-first DD/MM/YYYY or DD-MM-YYYY. */
  private parseDate(value: string): Date | null {
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (iso) {
      const d = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
      return isNaN(d.getTime()) || d.getUTCMonth() !== +iso[2] - 1 ? null : d;
    }
    const dmy = /^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/.exec(value);
    if (dmy) {
      const d = new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1]));
      return isNaN(d.getTime()) || d.getUTCMonth() !== +dmy[2] - 1 ? null : d;
    }
    return null;
  }

  // ------------------------------------------------------------- duplicates

  private nameDobKey(r: { firstName: string; lastName: string; dateOfBirth?: Date }): string | null {
    if (!r.dateOfBirth) return null;
    return `${r.firstName.toLowerCase()}|${r.lastName.toLowerCase()}|${r.dateOfBirth.toISOString().slice(0, 10)}`;
  }

  /** Batched read of existing org patients that collide on phone, email or name+dob. */
  private async loadExistingKeys(
    organizationId: string,
    valid: ParsedRow[],
  ): Promise<{ phones: Set<string>; emails: Set<string>; nameDob: Set<string> }> {
    const phones = new Set<string>();
    const emails = new Set<string>();
    const nameDob = new Set<string>();
    if (!valid.length) return { phones, emails, nameDob };

    const chunkSize = 300;
    for (let i = 0; i < valid.length; i += chunkSize) {
      const chunk = valid.slice(i, i + chunkSize);
      const or: Prisma.PatientWhereInput[] = [];
      for (const r of chunk) {
        if (r.phone) or.push({ phone: r.phone });
        if (r.email) or.push({ email: { equals: r.email, mode: 'insensitive' } });
        if (r.dateOfBirth) {
          or.push({
            firstName: { equals: r.firstName, mode: 'insensitive' },
            lastName: { equals: r.lastName, mode: 'insensitive' },
            dateOfBirth: r.dateOfBirth,
          });
        }
      }
      if (!or.length) continue;
      const rows = await this.prisma.patient.findMany({
        where: { organizationId, status: { not: 'ARCHIVED' }, OR: or },
        select: { phone: true, email: true, firstName: true, lastName: true, dateOfBirth: true },
      });
      for (const p of rows) {
        if (p.phone) phones.add(p.phone);
        if (p.email) emails.add(p.email.toLowerCase());
        if (p.dateOfBirth) nameDob.add(`${p.firstName.toLowerCase()}|${p.lastName.toLowerCase()}|${p.dateOfBirth.toISOString().slice(0, 10)}`);
      }
    }
    return { phones, emails, nameDob };
  }

  private duplicateReason(
    r: ParsedRow,
    existing: { phones: Set<string>; emails: Set<string>; nameDob: Set<string> },
    seen: { seenPhone: Set<string>; seenEmail: Set<string>; seenNameDob: Set<string> },
  ): string | null {
    if (r.phone && (existing.phones.has(r.phone) || seen.seenPhone.has(r.phone))) return 'Duplicate phone number';
    if (r.email) {
      const e = r.email.toLowerCase();
      if (existing.emails.has(e) || seen.seenEmail.has(e)) return 'Duplicate email';
    }
    const key = this.nameDobKey(r);
    if (key && (existing.nameDob.has(key) || seen.seenNameDob.has(key))) return 'Duplicate name and date of birth';
    return null;
  }

  // ----------------------------------------------------------------- insert

  private async insert(toCreate: ParsedRow[], user: RequestUser, results: ImportRowResult[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Serialise patient-code allocation per org (same lock the single create uses).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'patient-code:' + user.organizationId}))`;
      const last = await tx.patient.findFirst({
        where: { organizationId: user.organizationId, patientCode: { startsWith: 'PAT-' } },
        orderBy: { patientCode: 'desc' },
        select: { patientCode: true },
      });
      let n = last?.patientCode ? parseInt(last.patientCode.slice(4), 10) || 0 : 0;

      const codeByRow = new Map<number, string>();
      const patientData: Prisma.PatientCreateManyInput[] = toCreate.map((r) => {
        const patientCode = `PAT-${(++n).toString().padStart(6, '0')}`;
        codeByRow.set(r.row, patientCode);
        return {
          organizationId: user.organizationId,
          branchId: user.branchId,
          patientCode,
          createdBy: user.id,
          firstName: r.firstName,
          lastName: r.lastName,
          gender: r.gender,
          dateOfBirth: r.dateOfBirth,
          phone: r.phone,
          email: r.email,
          bloodGroup: r.bloodGroup,
        };
      });
      await tx.patient.createMany({ data: patientData });

      // Attach a HOME address for rows that carry any address field.
      const withAddress = toCreate.filter((r) => r.address || r.city || r.state || r.country || r.postalCode);
      if (withAddress.length) {
        const created = await tx.patient.findMany({
          where: { organizationId: user.organizationId, patientCode: { in: [...codeByRow.values()] } },
          select: { id: true, patientCode: true },
        });
        const idByCode = new Map(created.map((p) => [p.patientCode, p.id]));
        const addresses = withAddress
          .map((r) => {
            const patientId = idByCode.get(codeByRow.get(r.row)!);
            if (!patientId) return null;
            return {
              organizationId: user.organizationId,
              branchId: user.branchId,
              patientId,
              addressType: 'HOME',
              addressLine1: r.address,
              city: r.city,
              state: r.state,
              country: r.country,
              postalCode: r.postalCode,
            };
          })
          .filter(Boolean) as Prisma.PatientAddressCreateManyInput[];
        if (addresses.length) await tx.patientAddress.createMany({ data: addresses });
      }

      for (const r of toCreate) {
        results[r.row - 1] = { row: r.row, status: 'created', patientCode: codeByRow.get(r.row) };
      }
    });
  }
}
