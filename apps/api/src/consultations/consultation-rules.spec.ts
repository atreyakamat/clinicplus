import { ConflictException, ForbiddenException } from '@nestjs/common';
import { assertConsultationOpen, assertConsultationOwner, bmiCategory, computeBmi, withBmi } from './consultation-rules';

describe('consultation rules', () => {
  it('computes BMI from cm / kg', () => {
    expect(computeBmi(170, 72.5)).toBe(25.1);
    expect(computeBmi(180, 60)).toBe(18.5);
    expect(computeBmi(null, 70)).toBeNull();
    expect(computeBmi(170, 0)).toBeNull();
  });

  it('categorises BMI', () => {
    expect(bmiCategory(17)).toBe('Underweight');
    expect(bmiCategory(22)).toBe('Normal');
    expect(bmiCategory(27)).toBe('Overweight');
    expect(bmiCategory(31)).toBe('Obese');
    expect(bmiCategory(null)).toBeNull();
    expect(withBmi({ height: 160, weight: 80 })).toMatchObject({ bmi: 31.2, bmiCategory: 'Obese' });
  });

  it('locks completed consultations', () => {
    expect(() => assertConsultationOpen({ status: 'DRAFT' })).not.toThrow();
    expect(() => assertConsultationOpen({ status: 'COMPLETED' })).toThrow(ConflictException);
  });

  it('only the consulting doctor may edit', () => {
    expect(() => assertConsultationOwner({ doctorId: 'a' }, { id: 'a' })).not.toThrow();
    expect(() => assertConsultationOwner({ doctorId: 'a' }, { id: 'b' })).toThrow(ForbiddenException);
  });
});
