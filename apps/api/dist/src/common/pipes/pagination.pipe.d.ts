import { PipeTransform, ArgumentMetadata } from '@nestjs/common';
export declare class PaginationPipe implements PipeTransform {
    transform(value: any, metadata: ArgumentMetadata): any;
}
