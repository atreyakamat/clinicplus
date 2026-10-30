import { IsBooleanString, IsOptional } from 'class-validator';

/**
 * Query flags for POST /patients/import. `dryRun=true` validates and previews
 * without inserting anything. Multipart bodies arrive as strings, so this is a
 * string-boolean toggled off the query string.
 */
export class ImportPatientsQueryDto {
  @IsOptional()
  @IsBooleanString()
  dryRun?: string;
}

/** True when the dryRun flag is any of the accepted truthy string forms. */
export const isDryRun = (dto: ImportPatientsQueryDto): boolean => dto.dryRun === 'true' || dto.dryRun === '1';
