import { Module } from '@nestjs/common';
import { MalwareScannerService } from './malware-scanner.service';

@Module({
  providers: [MalwareScannerService],
  exports: [MalwareScannerService],
})
export class SecurityModule {}