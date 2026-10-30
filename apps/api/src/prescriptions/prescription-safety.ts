export type SafetyWarningType = 'ALLERGY' | 'DUPLICATE_ACTIVE' | 'DUPLICATE_IN_REQUEST';

export interface SafetyWarning {
  type: SafetyWarningType;
  medicineName: string;
  message: string;
  allergyName?: string;
  allergySeverity?: string | null;
  existingPrescriptionId?: string;
}

const MIN_MATCH = 3;

export function normalizeMedicine(name: string): string {
  return (name ?? '').toLowerCase().replace(/[^a-z0-9.+\- ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Generic stem of a medicine name: its first word ("paracetamol 500mg tab" → "paracetamol"). */
function stem(name: string): string {
  return normalizeMedicine(name).split(' ')[0] ?? '';
}

/** Case-insensitive substring match in either direction ("Penicillin" ↔ "Penicillin V 250mg"). */
export function allergyMatches(medicineName: string, allergyName: string): boolean {
  const m = normalizeMedicine(medicineName);
  const a = normalizeMedicine(allergyName);
  if (a.length >= MIN_MATCH && m.includes(a)) return true;
  if (m.length >= MIN_MATCH && a.includes(m)) return true;
  // The allergy's own first word (e.g. "Sulfa drugs" → "sulfa") against the medicine.
  const aStem = stem(allergyName);
  return aStem.length >= 4 && m.includes(aStem);
}

export function isSameMedicine(a: string, b: string): boolean {
  const na = normalizeMedicine(a);
  const nb = normalizeMedicine(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const sa = stem(a);
  return sa.length >= 4 && sa === stem(b);
}

/**
 * Prescription safety checks: allergy matches and duplicate therapy (same
 * medicine already in an ACTIVE prescription of the patient, or twice in the
 * same request).
 */
export function checkPrescriptionSafety(
  items: { medicineName: string }[],
  allergies: { allergyName: string; severity?: string | null }[],
  activeItems: { medicineName: string; prescriptionId: string }[],
): SafetyWarning[] {
  const warnings: SafetyWarning[] = [];
  items.forEach((item, idx) => {
    for (const allergy of allergies) {
      if (allergyMatches(item.medicineName, allergy.allergyName)) {
        warnings.push({
          type: 'ALLERGY',
          medicineName: item.medicineName,
          allergyName: allergy.allergyName,
          allergySeverity: allergy.severity ?? null,
          message: `${item.medicineName} matches the patient's recorded allergy "${allergy.allergyName}"${
            allergy.severity ? ` (${allergy.severity})` : ''
          }`,
        });
      }
    }
    const active = activeItems.find((a) => isSameMedicine(a.medicineName, item.medicineName));
    if (active) {
      warnings.push({
        type: 'DUPLICATE_ACTIVE',
        medicineName: item.medicineName,
        existingPrescriptionId: active.prescriptionId,
        message: `${item.medicineName} duplicates "${active.medicineName}" in an active prescription`,
      });
    }
    if (items.findIndex((other) => isSameMedicine(other.medicineName, item.medicineName)) < idx) {
      warnings.push({
        type: 'DUPLICATE_IN_REQUEST',
        medicineName: item.medicineName,
        message: `${item.medicineName} is listed more than once in this prescription`,
      });
    }
  });
  return warnings;
}
