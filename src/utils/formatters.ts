import type { ClinicalStatus, DataSourceType, MeasurementRecord } from '../types/hema.ts';

export function formatMeasurementValue(m: Pick<MeasurementRecord, 'measuredValue' | 'secondaryValue' | 'unit'>): string {
  const primary = Number.isInteger(m.measuredValue)
    ? String(m.measuredValue)
    : m.measuredValue.toFixed(1);
  if (m.secondaryValue !== null && m.secondaryValue !== undefined) {
    const sec = Number.isInteger(m.secondaryValue)
      ? String(m.secondaryValue)
      : m.secondaryValue.toFixed(1);
    return `${primary}/${sec}`;
  }
  return primary;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function formatDataSource(source: DataSourceType): string {
  if (source === 'ble_device') return 'Hema Nexus BLE';
  if (source === 'simulated_device') return 'SIMULATED Device';
  return 'Manual Entry';
}

export function getStatusDisplay(status: ClinicalStatus): {
  label: string;
  glyph: string;
  textClass: string;
} {
  switch (status) {
    case 'normal':
      return {
        label: 'Normal',
        glyph: '●',
        textClass: 'text-teal-700 dark:text-teal-400',
      };
    case 'borderline':
      return {
        label: 'Borderline',
        glyph: '▲',
        textClass: 'text-amber-700 dark:text-amber-400',
      };
    case 'elevated':
      return {
        label: 'Elevated',
        glyph: '▲',
        textClass: 'text-rose-700 dark:text-rose-400',
      };
    case 'low':
      return {
        label: 'Low',
        glyph: '▼',
        textClass: 'text-amber-700 dark:text-amber-400',
      };
    case 'critical':
      return {
        label: 'Critical',
        glyph: '✕',
        textClass: 'text-rose-700 dark:text-rose-400',
      };
  }
}
