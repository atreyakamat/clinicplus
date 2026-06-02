import { PipeTransform, ArgumentMetadata } from '@nestjs/common';
export declare class CSVParserPipe implements PipeTransform {
    transform(value: any, metadata: ArgumentMetadata): unknown[];
}
