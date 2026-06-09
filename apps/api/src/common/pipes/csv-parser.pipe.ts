import {
  Injectable,
  PipeTransform,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { parse } from 'csv-parse/sync';

@Injectable()
export class CSVParserPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    if (!value || typeof value !== 'string') {
      throw new BadRequestException('Invalid CSV data');
    }
    try {
      return parse(value, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch (error) {
      throw new BadRequestException(`CSV Parsing Error: ${error.message}`);
    }
  }
}
