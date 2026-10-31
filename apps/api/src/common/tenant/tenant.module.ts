import { Global, Module } from '@nestjs/common';
import { TenantAssertService } from './tenant-assert.service';

@Global()
@Module({
  providers: [TenantAssertService],
  exports: [TenantAssertService],
})
export class TenantModule {}
