import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Bluetooth,
  ChevronRight,
  Copy,
  Cpu,
  Database,
  Download,
  FileText,
  LogOut,
  QrCode,
  Settings,
  ShieldCheck,
  TrendingUp,
  User,
} from 'lucide-react';
import {
  HemaCard,
  SkeletonBlock,
  StatusBanner,
} from '../components/ui/HemaPrimitives.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import type { NavSection } from '../types/hema.ts';

interface ProfilePageProps {
  onNavigate?: (section: NavSection) => void;
}

export function ProfilePage({ onNavigate }: ProfilePageProps) {
  const { profile, updateProfile, signOutUser } = useAuth();
  const [fullName, setFullName] = useState(profile?.fullName || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [dateOfBirth, setDateOfBirth] = useState(profile?.dateOfBirth || '');
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.fullName || '');
      setPhone(profile.phone || '');
      setDateOfBirth(profile.dateOfBirth || '');
    }
  }, [profile]);

  // Privacy-safe QR payload: encodes only non-sensitive Patient ID token & issuer,
  // never unrestricted personal medical records.
  useEffect(() => {
    if (!profile) return;
    const payload = JSON.stringify({
      issuer: 'hema-nexus',
      patientId: profile.patientCode,
      verificationRequired: true,
    });
    QRCode.toDataURL(payload, { width: 240, margin: 2 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(null);
    setErrorMsg(null);
    try {
      await updateProfile({
        fullName: fullName.trim() || null,
        phone: phone.trim() || null,
        dateOfBirth: dateOfBirth.trim() || null,
      });
      setSavedNotice('Profile details saved.');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to save profile.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCopyPatientId = async () => {
    if (!profile) return;
    try {
      await navigator.clipboard.writeText(profile.patientCode);
      setCopiedId(true);
      window.setTimeout(() => setCopiedId(false), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl || !profile) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `${profile.patientCode}-health-qr.png`;
    link.click();
  };

  if (!profile) return null;

  const workspaceShortcuts: {
    id: NavSection;
    label: string;
    subtitle: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    {
      id: 'settings',
      label: 'App & Device Settings',
      subtitle: 'Theme, notifications, auto-sync, privacy',
      icon: Settings,
    },
    {
      id: 'device',
      label: 'Bluetooth & GATT Setup',
      subtitle: 'ESP32 pairing & calibration records',
      icon: Bluetooth,
    },
    {
      id: 'simulator',
      label: 'Simulated Device Mode',
      subtitle: 'Hardware-free diagnostic & clinic testing',
      icon: Cpu,
    },
    {
      id: 'trends',
      label: 'Health Trends',
      subtitle: 'Longitudinal biomarker charts & deltas',
      icon: TrendingUp,
    },
    {
      id: 'reports',
      label: 'Clinical PDF Reports',
      subtitle: 'Export & share diagnostic summaries',
      icon: FileText,
    },
    ...(profile.role === 'admin'
      ? [
          {
            id: 'admin' as NavSection,
            label: 'Database Administration',
            subtitle: 'PostgreSQL health, RBAC & audit logs',
            icon: Database,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Profile
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Manage your patient identity details, workspace shortcuts, and privacy-scoped Health QR identifier.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        <div className="lg:col-span-7 space-y-5 sm:space-y-6">
          <HemaCard className="p-4 sm:p-6">
            <form onSubmit={handleSave} className="space-y-5">
              <div className="flex items-center gap-4 pb-4 border-b border-[#D5E0EC] dark:border-[#1E2E42]">
                {profile.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt={profile.fullName || 'Patient Avatar'}
                    referrerPolicy="no-referrer"
                    className="h-14 w-14 rounded-full object-cover border border-[#005EB8]/40 dark:border-sky-400/40 shrink-0"
                  />
                ) : (
                  <div className="h-14 w-14 rounded-full bg-[#EEF3F8] dark:bg-[#0D1622] border border-[#D5E0EC] dark:border-[#24364D] flex items-center justify-center shrink-0">
                    <User className="w-6 h-6 text-[#005EB8] dark:text-sky-400" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-base font-display font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {profile.fullName || profile.email}
                  </div>
                  <div className="text-xs text-[#005EB8] dark:text-sky-300 font-mono truncate">
                    Patient ID: {profile.patientCode} · {profile.role}
                  </div>
                </div>
              </div>

              {errorMsg && (
                <StatusBanner
                  variant="error"
                  message={errorMsg}
                  onDismiss={() => setErrorMsg(null)}
                />
              )}

              {savedNotice && (
                <StatusBanner
                  variant="success"
                  message={savedNotice}
                  onDismiss={() => setSavedNotice(null)}
                />
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    maxLength={120}
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full h-11 px-3 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    disabled
                    value={profile.email}
                    className="w-full h-11 px-3 rounded-lg border border-[#D5E0EC] dark:border-[#1E2E42] bg-[#EEF3F8] dark:bg-[#091019] text-sm text-slate-500 dark:text-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    maxLength={40}
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98000 00000"
                    className="w-full h-11 px-3 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Assigned Patient ID
                  </label>
                  <input
                    type="text"
                    disabled
                    value={profile.patientCode}
                    className="w-full h-11 px-3 rounded-lg border border-[#D5E0EC] dark:border-[#1E2E42] bg-[#EEF3F8] dark:bg-[#091019] text-sm font-mono text-slate-500 dark:text-slate-400"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full sm:w-auto min-h-[46px] px-5 py-2.5 rounded-lg hn-btn-primary text-sm font-semibold disabled:opacity-60 whitespace-nowrap"
                >
                  {saving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </HemaCard>

          {/* Grouped Workspace & Settings Links */}
          {onNavigate && (
            <HemaCard className="overflow-hidden">
              <div className="px-4 sm:px-5 py-3.5 border-b border-[#D5E0EC] dark:border-[#1E2E42]">
                <h2 className="font-display text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100">
                  Workspace &amp; Account Tools
                </h2>
              </div>
              <div className="divide-y divide-[#D5E0EC] dark:divide-[#1E2E42]">
                {workspaceShortcuts.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onNavigate(item.id)}
                      className="w-full min-h-[56px] px-4 sm:px-5 py-3 flex items-center justify-between gap-3 text-left hover:bg-[#F8FAFC] dark:hover:bg-[#162232] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-lg bg-[#EEF3F8] dark:bg-[#0D1622] border border-[#D5E0EC] dark:border-[#24364D] flex items-center justify-center shrink-0">
                          <Icon className="w-4 h-4 text-[#005EB8] dark:text-sky-400" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                            {item.label}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {item.subtitle}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => void signOutUser()}
                  className="w-full min-h-[54px] px-4 sm:px-5 py-3 flex items-center justify-between gap-3 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50/70 dark:hover:bg-rose-950/25 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-rose-50 dark:bg-rose-950/35 border border-rose-200 dark:border-rose-500/30 flex items-center justify-center shrink-0">
                      <LogOut className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-semibold">Sign Out</span>
                  </div>
                  <ChevronRight className="w-4 h-4 opacity-70" />
                </button>
              </div>
            </HemaCard>
          )}
        </div>

        {/* Privacy-Conscious My Health QR Card */}
        <HemaCard
          variant="clinical"
          className="lg:col-span-5 p-4 sm:p-6 flex flex-col justify-between self-start"
        >
          <div>
            <div className="flex items-center gap-2.5">
              <QrCode className="w-5 h-5 text-sky-300" />
              <h2 className="font-display text-base font-semibold text-white">
                My Health QR
              </h2>
            </div>
            <p className="mt-2 text-xs text-slate-300 leading-relaxed">
              For clinic check-in and future authorized provider handshakes. This QR code encodes only your verification Patient ID ({profile.patientCode}) and never exposes unrestricted medical records.
            </p>

            <div className="mt-5 flex flex-col items-center justify-center p-5 rounded-xl bg-[#081829] border border-[#1E3F66]">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`Patient verification QR code for ${profile.patientCode}`}
                  className="h-44 w-44 rounded-lg bg-white p-2 border border-sky-400/30"
                />
              ) : (
                <SkeletonBlock className="h-44 w-44" />
              )}
              <div className="mt-3 font-mono text-xs font-semibold text-sky-300">
                {profile.patientCode}
              </div>

              <div className="mt-4 w-full grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopyPatientId()}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg border border-[#1E3F66] bg-[#0B2239] hover:bg-[#102944] text-xs font-medium text-white flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Copy className="w-3.5 h-3.5 text-sky-300" />
                  <span>{copiedId ? 'Copied!' : 'Copy ID'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadQr}
                  disabled={!qrDataUrl}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg hn-btn-primary text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Save QR</span>
                </button>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-[#173657] flex items-start gap-2.5 text-xs text-slate-300">
            <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
            <span>
              Protected access: third parties cannot retrieve measurements from this code without explicit patient consent.
            </span>
          </div>
        </HemaCard>
      </div>
    </div>
  );
}
