import type { ReferenceRangeConfig } from '../db/schema.ts';

export type ClinicalStatus =
  | 'normal'
  | 'borderline'
  | 'elevated'
  | 'low'
  | 'critical';

export function classifyMeasurementStatus(
  value: number,
  secondaryValue: number | null | undefined,
  range: ReferenceRangeConfig,
): ClinicalStatus {
  if (
    (range.criticalLow !== undefined && value <= range.criticalLow) ||
    (range.criticalHigh !== undefined && value >= range.criticalHigh)
  ) {
    return 'critical';
  }

  if (value < range.minNormal) {
    if (range.borderlineLow !== undefined && value >= range.borderlineLow) {
      return 'borderline';
    }
    return 'low';
  }

  if (value > range.maxNormal) {
    if (range.borderlineHigh !== undefined && value <= range.borderlineHigh) {
      return 'borderline';
    }
    return 'elevated';
  }

  if (
    secondaryValue !== null &&
    secondaryValue !== undefined &&
    range.secondaryMinNormal !== undefined &&
    range.secondaryMaxNormal !== undefined
  ) {
    if (secondaryValue < range.secondaryMinNormal) {
      return 'low';
    }
    if (secondaryValue > range.secondaryMaxNormal + 10) {
      return 'elevated';
    }
    if (secondaryValue > range.secondaryMaxNormal) {
      return 'borderline';
    }
  }

  return 'normal';
}

export function getPhysiologicalBounds(slug: string): {
  min: number;
  max: number;
  secondaryMin?: number;
  secondaryMax?: number;
} {
  switch (slug) {
    case 'glucose':
      return { min: 15, max: 700 };
    case 'cholesterol':
      return { min: 40, max: 600 };
    case 'triglycerides':
      return { min: 20, max: 1500 };
    case 'uric_acid':
      return { min: 0.5, max: 20 };
    case 'hemoglobin':
      return { min: 3, max: 25 };
    case 'total_protein':
      return { min: 2, max: 15 };
    case 'lactate':
      return { min: 0.1, max: 25 };
    case 'crp':
      return { min: 0, max: 300 };
    case 'temperature':
      return { min: 30, max: 44 };
    case 'creatinine':
      return { min: 0.1, max: 20 };
    case 'urea':
      return { min: 2, max: 200 };
    case 'blood_pressure':
      return { min: 50, max: 260, secondaryMin: 30, secondaryMax: 160 };
    case 'spo2':
      return { min: 50, max: 100, secondaryMin: 25, secondaryMax: 240 };
    case 'heart_rate':
    case 'ecg':
      return { min: 25, max: 240 };
    default:
      return { min: 0, max: 10000 };
  }
}

export function formatReferenceRange(
  range: ReferenceRangeConfig,
  unit: string,
  secondaryUnit?: string | null,
): string {
  const primary = `${range.minNormal}–${range.maxNormal} ${unit}`;
  if (
    range.secondaryMinNormal !== undefined &&
    range.secondaryMaxNormal !== undefined
  ) {
    return `${primary} · ${range.secondaryLabel || 'Secondary'} ${range.secondaryMinNormal}–${range.secondaryMaxNormal} ${secondaryUnit || unit}`;
  }
  return primary;
}
