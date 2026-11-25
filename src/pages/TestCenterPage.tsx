import { useState } from 'react';
import {
  Activity,
  Bluetooth,
  Cpu,
  Droplets,
  HeartPulse,
  Thermometer,
} from 'lucide-react';
import { HemaCard, SectionHeader } from '../components/ui/HemaPrimitives.tsx';
import { useBle } from '../contexts/BleContext.tsx';
import { useHemaData } from '../contexts/HemaDataContext.tsx';
import type { TestTypeRecord } from '../types/hema.ts';
import { formatReferenceRange } from '../utils/clinicalValidation.ts';

interface TestCenterPageProps {
  onSelectTest: (test: TestTypeRecord, mode?: 'ble' | 'manual') => void;
  onOpenSimulator?: () => void;
}

export function TestCenterPage({
  onSelectTest,
  onOpenSimulator,
}: TestCenterPageProps) {
  const { testCatalog } = useHemaData();
  const { state: bleState } = useBle();
  const [filter, setFilter] = useState<'all' | 'blood' | 'physiological'>('all');

  const filtered = testCatalog.filter((t) =>
    filter === 'all' ? true : t.category === filter,
  );

  const bloodTests = filtered.filter((t) => t.category === 'blood');
  const physioTests = filtered.filter((t) => t.category === 'physiological');

  const getStatusLabel = (test: TestTypeRecord) => {
    if (test.availabilityStatus === 'coming_soon') {
      return {
        label: 'Validation Pending',
        className: 'text-amber-700 dark:text-amber-300',
      };
    }
    if (test.availabilityStatus === 'unavailable') {
      return {
        label: 'Temporarily Unavailable',
        className: 'text-slate-500 dark:text-slate-400',
      };
    }
    if (bleState === 'connected') {
      return {
        label: 'Available · BLE Ready',
        className: 'text-teal-700 dark:text-teal-400',
      };
    }
    return {
      label: 'BLE or Manual Entry',
      className: 'text-[#005EB8] dark:text-sky-300',
    };
  };

  const renderCard = (test: TestTypeRecord) => {
    const status = getStatusLabel(test);
    const isComingSoon =
      test.availabilityStatus === 'coming_soon' ||
      test.availabilityStatus === 'unavailable';

    return (
      <HemaCard
        key={test.slug}
        className="p-4 sm:p-5 flex flex-col justify-between hover:border-[#005EB8]/50 dark:hover:border-sky-400/40"
      >
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="h-10 w-10 rounded-lg flex items-center justify-center text-white shrink-0"
                style={{ backgroundColor: test.accentColor }}
              >
                {test.category === 'blood' ? (
                  <Droplets className="w-4 h-4" />
                ) : test.slug === 'temperature' ? (
                  <Thermometer className="w-4 h-4" />
                ) : test.slug === 'heart_rate' || test.slug === 'ecg' ? (
                  <HeartPulse className="w-4 h-4" />
                ) : (
                  <Activity className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-base font-semibold truncate">
                  {test.testName}
                </h3>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {test.portNumber
                    ? `Port ${test.portNumber} · ${test.unit}`
                    : `Integrated Sensor · ${test.unit}`}
                </div>
              </div>
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {test.description}
          </p>

          <div className="mt-3 pt-3 border-t border-[#E2E8F0] dark:border-[#1E2E42] text-xs space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">Status</span>
              <span className={`font-semibold text-right ${status.className}`}>
                {status.label}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">
                Reference
              </span>
              <span className="font-mono text-[11px] text-right truncate">
                {formatReferenceRange(
                  test.referenceRangeConfig,
                  test.unit,
                  test.secondaryUnit,
                )}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          {!isComingSoon ? (
            <>
              <button
                type="button"
                onClick={() => onSelectTest(test, 'ble')}
                className="flex-1 min-h-[44px] px-3 py-2 rounded-lg hn-btn-primary text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Bluetooth className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {bleState === 'connected' ? 'Run BLE Test' : 'Start Test'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onSelectTest(test, 'manual')}
                className="min-h-[44px] px-3.5 py-2 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] text-xs font-medium hover:bg-slate-50 dark:hover:bg-white/[0.04] shrink-0"
              >
                Manual
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={test.availabilityStatus === 'unavailable'}
              onClick={() => onSelectTest(test, 'manual')}
              className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] text-xs font-medium hover:bg-slate-50 dark:hover:bg-white/[0.04] disabled:opacity-45"
            >
              {test.availabilityStatus === 'unavailable'
                ? 'Channel Temporarily Unavailable'
                : 'Log Lab Result Manually'}
            </button>
          )}
        </div>
      </HemaCard>
    );
  };

  return (
    <div className="space-y-6 sm:space-y-7">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
            Test Center
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Select a diagnostic assay channel or record validated laboratory measurements.
          </p>
        </div>

        <div className="grid grid-cols-3 sm:inline-flex items-center gap-1 p-1 rounded-lg bg-[#E2E8F0]/80 dark:bg-[#0D1622] border border-[#D5E0EC] dark:border-[#1E2E42] w-full sm:w-auto">
          {(
            [
              ['all', 'All Channels'],
              ['blood', 'Blood Panel'],
              ['physiological', 'Physiological'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`min-h-[38px] px-2.5 sm:px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap text-center ${
                filter === id
                  ? 'bg-white dark:bg-[#172436] text-[#005EB8] dark:text-sky-300 shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {bleState !== 'connected' && onOpenSimulator && (
        <HemaCard
          variant="simulation"
          className="px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="text-xs text-slate-700 dark:text-amber-100/85">
            <span className="font-semibold">
              No physical ESP32 hardware connected?
            </span>{' '}
            Run all 9 blood parameters and 4 physiological vitals immediately in{' '}
            <span className="font-mono font-semibold text-amber-800 dark:text-amber-300">
              Simulated Device Mode
            </span>
            .
          </div>
          <button
            type="button"
            onClick={onOpenSimulator}
            className="min-h-[42px] px-4 py-2 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold flex items-center justify-center gap-2 shrink-0"
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Open Simulator</span>
          </button>
        </HemaCard>
      )}

      {bloodTests.length > 0 && (
        <section className="space-y-3 sm:space-y-4">
          <SectionHeader
            title="Blood Assay Channels"
            subtitle="Firmware validation status shown per cartridge port"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4">
            {bloodTests.map(renderCard)}
          </div>
        </section>
      )}

      {physioTests.length > 0 && (
        <section className="space-y-3 sm:space-y-4">
          <SectionHeader
            title="Physiological Monitoring"
            subtitle="Integrated cuff, optical bay, and thermistor probe"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4">
            {physioTests.map(renderCard)}
          </div>
        </section>
      )}
    </div>
  );
}
