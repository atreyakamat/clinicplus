import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertUuid } from '../common/validation/uuid';
import { CreateFeedbackDto } from './dto/feedback.dto';

interface FeedbackActor {
  id: string;
  organizationId: string;
  branchId: string;
}

@Injectable()
export class FeedbackService {
  constructor(private prisma: PrismaService) {}

  create(dto: CreateFeedbackDto, actor: FeedbackActor) {
    return this.prisma.feedback.create({
      data: {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        userId: actor.id,
        category: dto.category,
        subject: dto.subject,
        content: dto.content,
        priority: dto.priority ?? 'MEDIUM',
      },
    });
  }

  /** Triagers (feedback.update) see the organization's feedback; everyone else sees their own. */
  findAll(actor: FeedbackActor, canTriage: boolean) {
    return this.prisma.feedback.findMany({
      where: { organizationId: actor.organizationId, ...(canTriage ? {} : { userId: actor.id }) },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async updateStatus(id: string, status: string, organizationId: string) {
    assertUuid(id, 'feedbackId');
    const feedback = await this.prisma.feedback.findFirst({ where: { id, organizationId } });
    if (!feedback) throw new NotFoundException('Feedback not found');
    return this.prisma.feedback.update({ where: { id }, data: { status } });
  }
}
