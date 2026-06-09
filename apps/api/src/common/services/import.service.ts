import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ImportService {
  constructor(private prisma: PrismaService) {}

  async validateAndPreview(entity: string, data: any[]) {
    const preview = data.slice(0, 10);
    const errors: any[] = [];

    data.forEach((row, index) => {
      if (entity === 'patient') {
        if (!row.firstName || !row.lastName) {
          errors.push({
            row: index + 1,
            message: 'First name and Last name are required',
          });
        }
      }
    });

    return {
      total: data.length,
      preview,
      errors: errors.length > 0 ? errors.slice(0, 20) : null,
      errorCount: errors.length,
    };
  }

  async processImport(
    entity: string,
    data: any[],
    context: { organizationId: string; branchId: string; userId: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      let importedCount = 0;

      for (const row of data) {
        if (entity === 'patient') {
          // Simple duplicate detection by email or phone
          const existing = await tx.patient.findFirst({
            where: {
              organizationId: context.organizationId,
              OR: [
                { email: row.email || 'none' },
                { phone: row.phone || 'none' },
              ],
            },
          });

          if (!existing) {
            await tx.patient.create({
              data: {
                ...row,
                organizationId: context.organizationId,
                branchId: context.branchId,
                createdBy: context.userId,
              },
            });
            importedCount++;
          }
        }
      }

      return { importedCount };
    });
  }
}
