import { PipeTransform, ArgumentMetadata } from '@nestjs/common';
export declare class FileValidationPipe implements PipeTransform {
    private readonly MAX_SIZE;
    private readonly ALLOWED_MIMES;
    transform(file: Express.Multer.File, metadata: ArgumentMetadata): Express.Multer.File;
}
