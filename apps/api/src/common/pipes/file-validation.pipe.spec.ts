import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { detectFileType, FileValidationPipe } from './file-validation.pipe';

const file = (buffer: Buffer, name = 'x.bin', mimetype = 'application/octet-stream') =>
  ({ buffer, size: buffer.length, originalname: name, mimetype }) as Express.Multer.File;

describe('FileValidationPipe / detectFileType', () => {
  const pipe = new FileValidationPipe({ get: () => 1 } as any); // 1 MB limit

  it('detects PDF, PNG, JPEG and DICOM by magic bytes', () => {
    expect(detectFileType(Buffer.from('%PDF-1.7 ...'))?.mime).toBe('application/pdf');
    expect(detectFileType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.mime).toBe('image/png');
    expect(detectFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]))?.mime).toBe('image/jpeg');
    expect(detectFileType(Buffer.concat([Buffer.alloc(128), Buffer.from('DICM')]))?.mime).toBe('application/dicom');
    expect(detectFileType(Buffer.from('<html><script>'))).toBeNull();
    expect(detectFileType(Buffer.from('MZ\x90\x00'))).toBeNull();
  });

  it('overrides the client mimetype with the detected one and sanitises the name', () => {
    const f = pipe.transform(file(Buffer.from('%PDF-1.4'), '../../etc/pa$$wd.png', 'image/png'));
    expect(f.mimetype).toBe('application/pdf');
    expect(f.originalname).not.toMatch(/[/$]/);
  });

  it('rejects missing, empty, oversized and unknown files', () => {
    expect(() => pipe.transform(undefined as any)).toThrow(BadRequestException);
    expect(() => pipe.transform(file(Buffer.alloc(0)))).toThrow(BadRequestException);
    expect(() => pipe.transform(file(Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(1024 * 1024)])))).toThrow(
      PayloadTooLargeException,
    );
    expect(() => pipe.transform(file(Buffer.from('GIF89a......')))).toThrow(BadRequestException);
  });
});
