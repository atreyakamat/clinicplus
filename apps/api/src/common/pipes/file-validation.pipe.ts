import { BadRequestException, Injectable, Optional, PayloadTooLargeException, PipeTransform } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface DetectedFileType {
  mime: string;
  ext: string;
  label: string;
}

/**
 * Detects the real file type from its leading bytes (never trusts the client's
 * Content-Type or filename). Supported: PDF, PNG, JPEG, DICOM.
 */
export function detectFileType(buf: Buffer | undefined): DetectedFileType | null {
  if (!buf || buf.length < 4) return null;
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: '.pdf', label: 'PDF' };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', ext: '.png', label: 'PNG' };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: '.jpg', label: 'JPEG' };
  if (buf.length >= 132 && buf.subarray(128, 132).toString('latin1') === 'DICM') {
    return { mime: 'application/dicom', ext: '.dcm', label: 'DICOM' };
  }
  return null;
}

export const maxUploadBytes = (mb?: number) => (mb && mb > 0 ? mb : Number(process.env.MAX_UPLOAD_MB) || 10) * 1024 * 1024;

/**
 * Validates an uploaded file: present, non-empty, within MAX_UPLOAD_MB and of an
 * allowed type by magic bytes. Overwrites `mimetype` with the detected type and
 * sanitises the original filename.
 */
@Injectable()
export class FileValidationPipe implements PipeTransform {
  private readonly maxBytes: number;

  constructor(@Optional() config?: ConfigService) {
    this.maxBytes = maxUploadBytes(config?.get<number>('MAX_UPLOAD_MB'));
  }

  transform(file: Express.Multer.File) {
    if (!file || !file.buffer) throw new BadRequestException('No file uploaded (multipart field "file")');
    if (file.size === 0 || file.buffer.length === 0) throw new BadRequestException('Uploaded file is empty');
    if (file.size > this.maxBytes) {
      throw new PayloadTooLargeException(
        `File exceeds the ${Math.round(this.maxBytes / 1024 / 1024)}MB limit (size: ${(file.size / 1024 / 1024).toFixed(2)}MB)`,
      );
    }
    const detected = detectFileType(file.buffer);
    if (!detected) {
      throw new BadRequestException('Unsupported or unrecognised file type. Allowed: PDF, PNG, JPEG, DICOM');
    }
    file.mimetype = detected.mime;
    const base = (file.originalname || 'document').replace(/[^a-zA-Z0-9.\-_ ]/g, '_').slice(0, 150);
    file.originalname = base || 'document';
    return file;
  }
}
