import { Module, Global } from '@nestjs/common';
import { TimelineService } from './timeline.service';

@Global()
@Module({
  providers: [TimelineService],
  exports: [TimelineService],
})
export class TimelineModule {}
