import { Global, Module } from '@nestjs/common';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';

// Global so JwtStrategy (AuthModule) and the branch/staff create paths can inject
// SubscriptionService for enforcement. PrismaService and AuditService are both
// provided by global modules, so no extra imports are needed here.
@Global()
@Module({
  controllers: [SubscriptionController],
  providers: [SubscriptionService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
