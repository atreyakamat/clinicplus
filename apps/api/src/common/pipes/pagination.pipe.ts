import { Injectable, PipeTransform, ArgumentMetadata, BadRequestException } from '@nestjs/common';

@Injectable()
export class PaginationPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    if (metadata.type !== 'query') return value;

    const page = parseInt(value.page, 10) || 1;
    const limit = parseInt(value.limit, 10) || 20;

    return {
      ...value,
      skip: (page - 1) * limit,
      take: limit,
      page,
    };
  }
}
