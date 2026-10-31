import { registerDecorator, ValidationOptions } from 'class-validator';

export const PASSWORD_POLICY_MESSAGE =
  'Password must be 8-128 characters and include an uppercase letter, a lowercase letter and a digit or special character';

/** Shared password policy for registration, invitation acceptance, password change and reset. */
export function isStrongPassword(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value.length < 8 || value.length > 128) return false;
  if (!/[A-Z]/.test(value)) return false;
  if (!/[a-z]/.test(value)) return false;
  if (!/[\d\W_]/.test(value)) return false;
  return true;
}

export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isStrongPassword',
      target: object.constructor,
      propertyName,
      options: { message: PASSWORD_POLICY_MESSAGE, ...validationOptions },
      validator: { validate: (value: unknown) => isStrongPassword(value) },
    });
  };
}
