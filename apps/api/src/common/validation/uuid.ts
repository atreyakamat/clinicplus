import { BadRequestException } from '@nestjs/common';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Throws 400 for malformed ids so Postgres never sees an invalid uuid literal. */
export function assertUuid(value: unknown, name = 'id'): string {
  if (!isUuid(value)) {
    throw new BadRequestException(`${name} must be a valid UUID`);
  }
  return value;
}
