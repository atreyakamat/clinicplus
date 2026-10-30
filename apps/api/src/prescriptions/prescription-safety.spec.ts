import { allergyMatches, checkPrescriptionSafety, isSameMedicine } from './prescription-safety';

describe('prescription safety checks', () => {
  it('matches allergies case-insensitively in either direction', () => {
    expect(allergyMatches('PENICILLIN V 250mg', 'penicillin')).toBe(true);
    expect(allergyMatches('Aspirin', 'Aspirin (NSAID)')).toBe(true);
    expect(allergyMatches('Sulfamethoxazole', 'Sulfa drugs')).toBe(true); // allergy stem
    expect(allergyMatches('Sulfa tablets', 'Sulfa drugs')).toBe(true);
    expect(allergyMatches('Amoxicillin', 'Penicillin')).toBe(false);
    expect(allergyMatches('Paracetamol', 'Peanuts')).toBe(false);
  });

  it('ignores very short names to avoid false positives', () => {
    expect(allergyMatches('Vitamin B12', 'B')).toBe(false);
  });

  it('identifies the same medicine across strengths', () => {
    expect(isSameMedicine('Metformin 500mg', 'metformin 1000 mg')).toBe(true);
    expect(isSameMedicine('Paracetamol', 'paracetamol')).toBe(true);
    expect(isSameMedicine('Metformin', 'Glimepiride')).toBe(false);
  });

  it('reports allergy, active duplicate and in-request duplicate warnings', () => {
    const warnings = checkPrescriptionSafety(
      [{ medicineName: 'Penicillin G' }, { medicineName: 'Metformin 500mg' }, { medicineName: 'metformin' }],
      [{ allergyName: 'Penicillin', severity: 'SEVERE' }],
      [{ medicineName: 'Metformin 1000mg', prescriptionId: 'rx-1' }],
    );
    expect(warnings.map((w) => w.type)).toEqual(['ALLERGY', 'DUPLICATE_ACTIVE', 'DUPLICATE_ACTIVE', 'DUPLICATE_IN_REQUEST']);
    expect(warnings[0]).toMatchObject({ allergyName: 'Penicillin', allergySeverity: 'SEVERE' });
    expect(warnings[1].existingPrescriptionId).toBe('rx-1');
  });

  it('returns no warnings for a clean prescription', () => {
    expect(checkPrescriptionSafety([{ medicineName: 'Cetirizine' }], [{ allergyName: 'Latex' }], [])).toEqual([]);
  });
});
