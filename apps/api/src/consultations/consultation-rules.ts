import { ConflictException, ForbiddenException } from '@nestjs/common';

export const CONSULTATION_LOCKED_MESSAGE =
  'Consultation is completed and locked. Add an addendum instead of editing it.';

/** Completed consultations are part of the legal medical record: no edits, only addenda. */
export function assertConsultationOpen(c: { status: string }) {
  if (c.status === 'COMPLETED') throw new ConflictException(CONSULTATION_LOCKED_MESSAGE);
}

/** Only the consulting doctor may change a consultation's clinical content. */
export function assertConsultationOwner(c: { doctorId: string }, user: { id: string }) {
  if (c.doctorId !== user.id) {
    throw new ForbiddenException('Only the consulting doctor can modify this consultation');
  }
}

/** BMI (kg/m²) from height in cm and weight in kg, rounded to 1 decimal. */
export function computeBmi(heightCm?: number | null, weightKg?: number | null): number | null {
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

export function bmiCategory(bmi: number | null): string | null {
  if (bmi === null) return null;
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Normal';
  if (bmi < 30) return 'Overweight';
  return 'Obese';
}

export function withBmi<T extends { height?: number | null; weight?: number | null }>(v: T) {
  const bmi = computeBmi(v.height, v.weight);
  return { ...v, bmi, bmiCategory: bmiCategory(bmi) };
}
