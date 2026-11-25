import { useState } from 'react';
import {
  Bluetooth,
  ChevronRight,
  Cpu,
  Database,
  HelpCircle,
  LogOut,
  Play,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { HemaCard, StatusBanner } from '../components/ui/HemaPrimitives.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import type { NavSection, UserPreferences } from '../types/hema.ts';

interface SettingsPageProps {
  onReplayIntro: () => void;
  onNavigate?: (section: NavSection) => void;
}

export function SettingsPage({
  onReplayIntro,
  onNavigate,
}: SettingsPageProps) {
  const { profile, updateProfile, setThemeMode, signOutUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!profile) return null;

  const prefs = profile.preferences;

  const updatePref = async (patch: Partial<UserPreferences>) => {
    setSaving(true);
    setNotice(null);
    setErrorMsg(null);
    try {
      await updateProfile({
        preferences: {
          ...prefs,
          ...patch,
        },
      });
      setNotice('Preferences updated.');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to save preferences.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleThemeChange = async (mode: UserPreferences['theme']) => {
    setSaving(true);
    setNotice(null);
    setErrorMsg(null);
    try {
      await setThemeMode(mode);
      setNotice(`Theme updated to ${mode}.`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to persist theme.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 max-w-3xl">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Settings
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Configure clinical display appearance, Bluetooth sync, notifications, health privacy, and account preferences.
        </p>
      </div>

      {errorMsg && (
        <StatusBanner
          variant="error"
          message={errorMsg}
          onDismiss={() => setErrorMsg(null)}
        />
      )}

      {notice && (
        <StatusBanner
          variant="success"
          message={notice}
          onDismiss={() => setNotice(null)}
        />
      )}

      {/* Appearance & Intro */}
      <HemaCard className="p-4 sm:p-6 space-y-4">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Appearance
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Clinical Daylight is the primary Hema Nexus appearance; switch to Clinical Night (ICU) or System anytime.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          {(['light', 'dark', 'system'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={saving}
              onClick={() => void handleThemeChange(mode)}
              className={`min-h-[44px] px-3 py-2 rounded-lg border text-sm font-medium capitalize transition-colors ${
                prefs.theme === mode
                  ? 'border-[#005EB8] dark:border-sky-400 bg-sky-50 dark:bg-sky-950/35 text-[#005EB8] dark:text-sky-300 font-semibold'
                  : 'border-[#D5E0EC] dark:border-[#24364D] text-slate-700 dark:text-slate-300 hover:bg-[#F8FAFC] dark:hover:bg-[#162232]'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="pt-3 border-t border-[#D5E0EC] dark:border-[#1E2E42] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
              Opening Experience
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Replay the Hema Nexus clinical workstation startup sequence.
            </div>
          </div>
          <button
            type="button"
            onClick={onReplayIntro}
            className="min-h-[42px] px-4 py-2 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] text-xs font-medium text-slate-800 dark:text-slate-200 flex items-center justify-center gap-1.5 shrink-0 hover:bg-[#F8FAFC] dark:hover:bg-[#162232] whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5 text-[#005EB8] dark:text-sky-400" />
            <span>Replay Intro</span>
          </button>
        </div>
      </HemaCard>

      {/* Device & Bluetooth Configuration */}
      <HemaCard className="p-4 sm:p-6 space-y-2">
        <div className="flex items-center justify-between gap-2 pb-2">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Device &amp; Notifications
          </h2>
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('device')}
              className="text-xs font-medium text-[#005EB8] dark:text-sky-300 hover:underline flex items-center gap-1 whitespace-nowrap"
            >
              <Bluetooth className="w-3.5 h-3.5" />
              <span>BLE Setup</span>
            </button>
          )}
        </div>

        {(
          [
            {
              key: 'notificationsEnabled' as const,
              title: 'Clinical Range Alerts',
              desc: 'Create an in-app notification when a recorded value falls outside reference intervals.',
              checked: prefs.notificationsEnabled,
            },
            {
              key: 'deviceAlertsEnabled' as const,
              title: 'BLE Connection Alerts',
              desc: 'Log notifications when a Hema Nexus unit pairs or disconnects.',
              checked: prefs.deviceAlertsEnabled,
            },
            {
              key: 'autoSyncBle' as const,
              title: 'Auto-Sync BLE Packets',
              desc: 'Automatically stage incoming validated GATT packets for database storage.',
              checked: prefs.autoSyncBle,
            },
          ] as const
        ).map((item, idx) => (
          <label
            key={item.key}
            className={`min-h-[60px] flex items-center justify-between gap-4 py-3 cursor-pointer ${
              idx > 0 ? 'border-t border-[#D5E0EC] dark:border-[#1E2E42]' : ''
            }`}
          >
            <div className="pr-2">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {item.title}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                {item.desc}
              </div>
            </div>
            <span className="relative inline-flex items-center shrink-0">
              <input
                type="checkbox"
                checked={item.checked}
                onChange={(e) =>
                  void updatePref({ [item.key]: e.target.checked })
                }
                className="sr-only peer"
              />
              <span className="w-11 h-6 bg-slate-300 dark:bg-[#24364D] peer-checked:bg-[#005EB8] dark:peer-checked:bg-sky-500 rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-5" />
            </span>
          </label>
        ))}
      </HemaCard>

      {/* Privacy, Health Data & Help / About */}
      <HemaCard className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-[#005EB8] dark:text-sky-400" />
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Privacy, Hardware &amp; About
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600 dark:text-slate-300">
          <div className="p-3.5 rounded-lg bg-[#F8FAFC] dark:bg-[#0D1622] border border-[#D5E0EC] dark:border-[#1E2E42]">
            <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-[#005EB8] dark:text-sky-400" />
              <span>Mobile Hardware BLE</span>
            </div>
            <p className="mt-1 leading-relaxed">
              Use Chrome on Android over HTTPS for physical ESP32 Bluetooth pairing. Simulated Device Mode works across all mobile and desktop browsers.
            </p>
          </div>
          <div className="p-3.5 rounded-lg bg-[#F8FAFC] dark:bg-[#0D1622] border border-[#D5E0EC] dark:border-[#1E2E42]">
            <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
              <span>PostgreSQL &amp; Privacy Isolation</span>
            </div>
            <p className="mt-1 leading-relaxed">
              Simulated measurements are stored with{' '}
              <span className="font-mono text-[#005EB8] dark:text-sky-300">
                is_simulated = true
              </span>{' '}
              and Health QR exposes only your verification ID ({profile.patientCode}).
            </p>
          </div>
        </div>

        {onNavigate && (
          <div className="pt-2 border-t border-[#D5E0EC] dark:border-[#1E2E42] flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onNavigate('simulator')}
              className="min-h-[40px] px-3.5 py-1.5 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] text-xs font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1.5 hover:bg-[#F8FAFC] dark:hover:bg-[#162232] whitespace-nowrap"
            >
              <Cpu className="w-3.5 h-3.5 text-amber-700 dark:text-amber-300" />
              <span>Open Simulated Mode</span>
            </button>
            {profile.role === 'admin' && (
              <button
                type="button"
                onClick={() => onNavigate('admin')}
                className="min-h-[40px] px-3.5 py-1.5 rounded-lg border border-[#173657] bg-[#0B2239] hover:bg-[#102944] text-xs font-medium text-sky-200 flex items-center gap-1.5 whitespace-nowrap"
              >
                <Database className="w-3.5 h-3.5" />
                <span>Database Admin Console</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </HemaCard>

      {/* Account Session */}
      <HemaCard className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Account Session
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            Signed in as {profile.email} ({profile.patientCode}).
          </p>
        </div>

        <button
          type="button"
          onClick={() => void signOutUser()}
          className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-lg border border-rose-300 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 text-sm font-medium flex items-center justify-center gap-2 shrink-0 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors whitespace-nowrap"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </HemaCard>
    </div>
  );
}
