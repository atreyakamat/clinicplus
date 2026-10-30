import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { stringify } from 'csv-stringify/sync';
import { PatientsService } from './patients.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CreatePatientDto, EmergencyContactDto, PatientAddressDto, PatientTagDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { DuplicateCheckQueryDto, ListPatientsQueryDto, SearchPatientsQueryDto } from './dto/patient-query.dto';
import { ArchivePatientDto, FamilyMemberDto, PatientNoteDto } from './dto/patient-subresources.dto';

/** Neutralises spreadsheet formula injection in exported cells. */
const csvSafe = (v: unknown) => {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};

@Controller('api/v1/patients')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  /** Enriched quick search used by the global search bar. */
  @Get('search')
  @Permissions('patients.view')
  search(@Query() q: SearchPatientsQueryDto, @Request() req) {
    return this.patientsService.search(req.user, q.q);
  }

  @Get('duplicates')
  @Permissions('patients.view')
  duplicates(@Query() q: DuplicateCheckQueryDto, @Request() req) {
    return this.patientsService.checkDuplicates(q, req.user);
  }

  @Get('tags')
  @Permissions('patients.view')
  tags(@Request() req) {
    return this.patientsService.distinctTags(req.user);
  }

  @Get('export/csv')
  @Permissions('patients.export')
  async exportCsv(@Query() q: ListPatientsQueryDto, @Request() req, @Res() res) {
    const rows = await this.patientsService.exportRows(req.user, q);
    const csv = stringify(
      rows.map((p) => ({
        patientCode: csvSafe(p.patientCode),
        firstName: csvSafe(p.firstName),
        lastName: csvSafe(p.lastName),
        email: csvSafe(p.email),
        phone: csvSafe(p.phone),
        gender: csvSafe(p.gender),
        dateOfBirth: csvSafe(p.dateOfBirth),
        bloodGroup: csvSafe(p.bloodGroup),
        status: csvSafe(p.status),
      })),
      {
        header: true,
        columns: [
          { key: 'patientCode', header: 'Patient ID' },
          { key: 'firstName', header: 'First Name' },
          { key: 'lastName', header: 'Last Name' },
          { key: 'email', header: 'Email' },
          { key: 'phone', header: 'Phone' },
          { key: 'gender', header: 'Gender' },
          { key: 'dateOfBirth', header: 'DOB' },
          { key: 'bloodGroup', header: 'Blood Group' },
          { key: 'status', header: 'Status' },
        ],
      },
    );
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="patients-${new Date().toISOString().split('T')[0]}.csv"`,
    });
    return res.send(csv);
  }

  @Post()
  @Permissions('patients.create')
  create(@Body() dto: CreatePatientDto, @Request() req) {
    return this.patientsService.create(dto, req.user);
  }

  @Get()
  @Permissions('patients.view')
  findAll(@Query() q: ListPatientsQueryDto, @Request() req) {
    return this.patientsService.findAll(req.user, q);
  }

  /** Profile hub; clinical / financial sections are omitted per caller permissions. */
  @Get(':id/summary')
  @Permissions('patients.view')
  summary(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.patientsService.summary(id, req.user);
  }

  @Get(':id')
  @Permissions('patients.view')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.patientsService.findOne(id, req.user);
  }

  @Patch(':id')
  @Permissions('patients.update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePatientDto, @Request() req) {
    return this.patientsService.update(id, dto, req.user);
  }

  /** Archive (soft delete). */
  @Delete(':id')
  @Permissions('patients.delete')
  archive(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ArchivePatientDto, @Request() req) {
    return this.patientsService.archive(id, dto ?? {}, req.user);
  }

  @Post(':id/archive')
  @Permissions('patients.delete')
  archivePost(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ArchivePatientDto, @Request() req) {
    return this.patientsService.archive(id, dto ?? {}, req.user);
  }

  @Post(':id/restore')
  @Permissions('patients.delete')
  restore(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.patientsService.restore(id, req.user);
  }

  // addresses
  @Post(':id/addresses')
  @Permissions('patients.update')
  addAddress(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PatientAddressDto, @Request() req) {
    return this.patientsService.addAddress(id, dto, req.user);
  }

  @Patch(':id/addresses/:addressId')
  @Permissions('patients.update')
  updateAddress(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Body() dto: PatientAddressDto,
    @Request() req,
  ) {
    return this.patientsService.updateAddress(id, addressId, dto, req.user);
  }

  @Delete(':id/addresses/:addressId')
  @Permissions('patients.update')
  removeAddress(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Request() req,
  ) {
    return this.patientsService.removeAddress(id, addressId, req.user);
  }

  // emergency contacts
  @Post(':id/emergency-contacts')
  @Permissions('patients.update')
  addContact(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EmergencyContactDto, @Request() req) {
    return this.patientsService.addEmergencyContact(id, dto, req.user);
  }

  @Patch(':id/emergency-contacts/:contactId')
  @Permissions('patients.update')
  updateContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body() dto: EmergencyContactDto,
    @Request() req,
  ) {
    return this.patientsService.updateEmergencyContact(id, contactId, dto, req.user);
  }

  @Delete(':id/emergency-contacts/:contactId')
  @Permissions('patients.update')
  removeContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Request() req,
  ) {
    return this.patientsService.removeEmergencyContact(id, contactId, req.user);
  }

  // family members
  @Post(':id/family-members')
  @Permissions('patients.update')
  addFamily(@Param('id', ParseUUIDPipe) id: string, @Body() dto: FamilyMemberDto, @Request() req) {
    return this.patientsService.addFamilyMember(id, dto, req.user);
  }

  @Delete(':id/family-members/:linkId')
  @Permissions('patients.update')
  removeFamily(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @Request() req,
  ) {
    return this.patientsService.removeFamilyMember(id, linkId, req.user);
  }

  // tags
  @Post(':id/tags')
  @Permissions('patients.update')
  addTag(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PatientTagDto, @Request() req) {
    return this.patientsService.addTag(id, dto, req.user);
  }

  @Delete(':id/tags/:tagId')
  @Permissions('patients.update')
  removeTag(@Param('id', ParseUUIDPipe) id: string, @Param('tagId', ParseUUIDPipe) tagId: string, @Request() req) {
    return this.patientsService.removeTag(id, tagId, req.user);
  }

  // notes
  @Get(':id/notes')
  @Permissions('patients.view')
  notes(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.patientsService.listNotes(id, req.user);
  }

  @Post(':id/notes')
  @Permissions('patients.update')
  addNote(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PatientNoteDto, @Request() req) {
    return this.patientsService.addNote(id, dto, req.user);
  }

  @Delete(':id/notes/:noteId')
  @Permissions('patients.update')
  removeNote(@Param('id', ParseUUIDPipe) id: string, @Param('noteId', ParseUUIDPipe) noteId: string, @Request() req) {
    return this.patientsService.removeNote(id, noteId, req.user);
  }
}
