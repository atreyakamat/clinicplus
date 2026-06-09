import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';

@Injectable()
export class FileValidationPipe implements PipeTransform {
  private readonly MAX_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly ALLOWED_MIMES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  transform(file: Express.Multer.File, metadata: ArgumentMetadata) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (file.size > this.MAX_SIZE) {
      throw new BadRequestException(
        `File size exceeds 10MB limit (size: ${(file.size / 1024 / 1024).toFixed(2)}MB)`,
      );
    }

    if (!this.ALLOWED_MIMES.includes(file.mimetype)) {
      throw new BadRequestException(`Unsupported file type: ${file.mimetype}`);
    }

    // Security Hardening: Basic filename sanitization
    file.originalname = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');

    return file;
  }
}
