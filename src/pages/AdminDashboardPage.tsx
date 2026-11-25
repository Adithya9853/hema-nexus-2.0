import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Building2,
  ClipboardList,
  Cpu,
  Database,
  RefreshCw,
  Search,
  ShieldAlert,
  Sliders,
  Users,
} from 'lucide-react';
import { HemaCard, StatusBanner } from '../components/ui/HemaPrimitives.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import { useHemaData } from '../contexts/HemaDataContext.tsx';
import { apiRequest } from '../services/api/client.ts';
import type {
  AccountStatus,
  AuditLogRecord,
  CalibrationRecord,
  DeviceEventRecord,
  DeviceRecord,
  HospitalRecord,
  MeasurementRecord,
  PatientRecord,
  TestSessionRecord,
  UserProfile,
  UserRole,
} from '../types/hema.ts';
import { formatDateTime, formatMeasurementValue } from '../utils/formatters.ts';

type AdminTab =
  | 'overview'
  | 'users'
  | 'hospitals'
  | 'patients'
  | 'devices'
  | 'sessions'
  | 'audit'
  | 'ranges';

interface AdminOverviewResponse {
  health: {
    database: string;
    dialect: string;
    latencyMs: number;
    checkedAt: string;
  };
  tableCounts: Record<string, number>;
}

export function AdminDashboardPage() {
  const { profile } = useAuth();
  const { testCatalog, refreshAll } = useHemaData();

  const [tab, setTab] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [hospitalsList, setHospitalsList] = useState<HospitalRecord[]>([]);
  const [patientsList, setPatientsList] = useState<PatientRecord[]>([]);
  const [patientQuery, setPatientQuery] = useState('');
  const [devicesList, setDevicesList] = useState<DeviceRecord[]>([]);
  const [deviceEventsList, setDeviceEventsList] = useState<DeviceEventRecord[]>(
    [],
  );
  const [calibrationsList, setCalibrationsList] = useState<CalibrationRecord[]>(
    [],
  );
  const [sessionsList, setSessionsList] = useState<TestSessionRecord[]>([]);
  const [measurementsList, setMeasurementsList] = useState<MeasurementRecord[]>(
    [],
  );
  const [auditList, setAuditList] = useState<AuditLogRecord[]>([]);

  const [selectedRangeSlug, setSelectedRangeSlug] = useState('glucose');
  const [minNormalInput, setMinNormalInput] = useState('');
  const [maxNormalInput, setMaxNormalInput] = useState('');
  const [borderlineHighInput, setBorderlineHighInput] = useState('');
  const [criticalHighInput, setCriticalHighInput] = useState('');

  const [newHospitalName, setNewHospitalName] = useState('');
  const [newHospitalEmail, setNewHospitalEmail] = useState('');

  const loadTab = useCallback(
    async (targetTab: AdminTab, qOverride?: string) => {
      if (profile?.role !== 'admin') return;
      setLoading(true);
      setError(null);
      try {
        if (targetTab === 'overview') {
          const res = await apiRequest<AdminOverviewResponse>(
            '/api/admin/overview',
          );
          setOverview(res);
        } else if (targetTab === 'users') {
          const [uRes, hRes] = await Promise.all([
            apiRequest<{ users: UserProfile[] }>('/api/admin/users'),
            apiRequest<{ hospitals: HospitalRecord[] }>('/api/admin/hospitals'),
          ]);
          setUsersList(uRes.users);
          setHospitalsList(hRes.hospitals);
        } else if (targetTab === 'hospitals') {
          const hRes = await apiRequest<{ hospitals: HospitalRecord[] }>(
            '/api/admin/hospitals',
          );
          setHospitalsList(hRes.hospitals);
        } else if (targetTab === 'patients') {
          const q = (qOverride ?? patientQuery).trim();
          const pRes = await apiRequest<{ patients: PatientRecord[] }>(
            `/api/admin/patients${q ? `?q=${encodeURIComponent(q)}` : ''}`,
          );
          setPatientsList(pRes.patients);
        } else if (targetTab === 'devices') {
          const [dRes, cRes] = await Promise.all([
            apiRequest<{
              devices: DeviceRecord[];
              deviceEvents: DeviceEventRecord[];
            }>('/api/admin/devices'),
            apiRequest<{ calibrations: CalibrationRecord[] }>(
              '/api/admin/calibrations',
            ),
          ]);
          setDevicesList(dRes.devices);
          setDeviceEventsList(dRes.deviceEvents);
          setCalibrationsList(cRes.calibrations);
        } else if (targetTab === 'sessions') {
          const [sRes, mRes] = await Promise.all([
            apiRequest<{ testSessions: TestSessionRecord[] }>(
              '/api/admin/test-sessions',
            ),
            apiRequest<{ measurements: MeasurementRecord[] }>(
              '/api/admin/measurements',
            ),
          ]);
          setSessionsList(sRes.testSessions);
          setMeasurementsList(mRes.measurements);
        } else if (targetTab === 'audit') {
          const aRes = await apiRequest<{ auditLogs: AuditLogRecord[] }>(
            '/api/admin/audit-logs',
          );
          setAuditList(aRes.auditLogs);
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load administration view.',
        );
      } finally {
        setLoading(false);
      }
    },
    [profile?.role, patientQuery],
  );

  useEffect(() => {
    if (profile?.role === 'admin') {
      void loadTab(tab);
    }
  }, [tab, profile?.role, loadTab]);

  useEffect(() => {
    const meta = testCatalog.find((t) => t.slug === selectedRangeSlug);
    if (meta) {
      setMinNormalInput(String(meta.referenceRangeConfig.minNormal));
      setMaxNormalInput(String(meta.referenceRangeConfig.maxNormal));
      setBorderlineHighInput(
        meta.referenceRangeConfig.borderlineHigh !== undefined
          ? String(meta.referenceRangeConfig.borderlineHigh)
          : '',
      );
      setCriticalHighInput(
        meta.referenceRangeConfig.criticalHigh !== undefined
          ? String(meta.referenceRangeConfig.criticalHigh)
          : '',
      );
    }
  }, [selectedRangeSlug, testCatalog]);

  if (profile?.role !== 'admin') {
    return (
      <HemaCard className="p-8 text-center max-w-lg mx-auto my-12 border-rose-300/70 dark:border-rose-500/30">
        <ShieldAlert className="w-8 h-8 text-rose-600 dark:text-rose-400 mx-auto mb-3" />
        <h1 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
          Administrator Access Required
        </h1>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
          Database administration and multi-tenant inspection routes are strictly restricted to authorized Hema Nexus administrators.
        </p>
      </HemaCard>
    );
  }

  const handleUpdateUser = async (
    uid: string,
    patch: {
      role?: UserRole;
      accountStatus?: AccountStatus;
      hospitalId?: number | null;
    },
  ) => {
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{ user: UserProfile }>(
        `/api/admin/users/${encodeURIComponent(uid)}`,
        { method: 'PATCH', body: patch },
      );
      setUsersList((prev) =>
        prev.map((u) => (u.uid === uid ? res.user : u)),
      );
      setNotice(`Updated permissions/status for ${res.user.email}.`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update user record.',
      );
    }
  };

  const handleCreateHospital = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHospitalName.trim()) return;
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{ hospital: HospitalRecord }>(
        '/api/hospitals',
        {
          method: 'POST',
          body: {
            name: newHospitalName.trim(),
            contactEmail: newHospitalEmail.trim() || null,
          },
        },
      );
      setHospitalsList((prev) => [res.hospital, ...prev]);
      setNewHospitalName('');
      setNewHospitalEmail('');
      setNotice(
        `Registered facility ${res.hospital.name} (${res.hospital.hospitalCode}).`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create hospital.',
      );
    }
  };

  const handleHospitalStatus = async (
    hospitalId: number,
    accountStatus: AccountStatus,
  ) => {
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{ hospital: HospitalRecord }>(
        `/api/hospitals/${hospitalId}`,
        { method: 'PATCH', body: { accountStatus } },
      );
      setHospitalsList((prev) =>
        prev.map((h) => (h.id === hospitalId ? res.hospital : h)),
      );
      setNotice(`Facility status set to ${accountStatus}.`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update facility.',
      );
    }
  };

  const handleSaveReferenceRange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const minNormal = Number(minNormalInput);
    const maxNormal = Number(maxNormalInput);
    const borderlineHigh =
      borderlineHighInput.trim() !== '' ? Number(borderlineHighInput) : null;
    const criticalHigh =
      criticalHighInput.trim() !== '' ? Number(criticalHighInput) : null;

    if (!Number.isFinite(minNormal) || !Number.isFinite(maxNormal)) {
      setError('Min Normal and Max Normal must be valid numbers.');
      return;
    }
    if (minNormal >= maxNormal) {
      setError('Min Normal must be strictly lower than Max Normal.');
      return;
    }
    if (
      borderlineHigh !== null &&
      (!Number.isFinite(borderlineHigh) || borderlineHigh < maxNormal)
    ) {
      setError('Borderline High must be greater than or equal to Max Normal.');
      return;
    }
    if (
      criticalHigh !== null &&
      (!Number.isFinite(criticalHigh) || criticalHigh < maxNormal)
    ) {
      setError('Critical High must be greater than or equal to Max Normal.');
      return;
    }
    if (
      borderlineHigh !== null &&
      criticalHigh !== null &&
      criticalHigh < borderlineHigh
    ) {
      setError('Critical High must be greater than or equal to Borderline High.');
      return;
    }

    try {
      await apiRequest(`/api/test-types/${selectedRangeSlug}/reference-range`, {
        method: 'PUT',
        body: {
          referenceRangeConfig: {
            minNormal,
            maxNormal,
            ...(borderlineHigh !== null ? { borderlineHigh } : {}),
            ...(criticalHigh !== null ? { criticalHigh } : {}),
          },
        },
      });
      await refreshAll();
      setNotice(
        `Updated clinical reference range thresholds for ${selectedRangeSlug}.`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update range config.',
      );
    }
  };

  const selectClass =
    'h-8 px-2 rounded border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400';

  const mobileSelectClass =
    'w-full h-10 px-2 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400';

  const tableHeaderRowClass =
    'bg-[#EEF3F8] dark:bg-[#0D1622] text-slate-600 dark:text-slate-400 border-b border-[#D5E0EC] dark:border-[#1E2E42] uppercase text-[11px] tracking-wider';

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Database Administration
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Restricted PostgreSQL health monitor, RBAC user management, hospital oversight, and system-wide audit logs.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadTab(tab)}
          disabled={loading}
          className="min-h-[42px] px-4 py-2 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-white dark:bg-[#111B27] hover:bg-slate-50 dark:hover:bg-[#162232] text-xs font-medium text-slate-800 dark:text-slate-200 flex items-center justify-center gap-2 self-stretch sm:self-auto whitespace-nowrap"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 text-[#005EB8] dark:text-sky-400 ${
              loading ? 'animate-spin' : ''
            }`}
          />
          <span>Refresh View</span>
        </button>
      </div>

      {/* Swipeable Tabs on Mobile, Wrapped Pills on Desktop */}
      <div className="flex lg:flex-wrap gap-1.5 p-1.5 rounded-lg bg-[#EEF3F8] dark:bg-[#0D1622] border border-[#D5E0EC] dark:border-[#1E2E42] overflow-x-auto no-scrollbar">
        {(
          [
            ['overview', 'DB Health', Database],
            ['users', 'Users & Roles', Users],
            ['hospitals', 'Hospitals', Building2],
            ['patients', 'Patients', Search],
            ['devices', 'Devices & Cal', Cpu],
            ['sessions', 'Sessions', Activity],
            ['audit', 'Audit Logs', ClipboardList],
            ['ranges', 'Ref Ranges', Sliders],
          ] as [AdminTab, string, React.ComponentType<{ className?: string }>][]
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`min-h-[38px] px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              tab === id
                ? 'bg-white dark:bg-[#18273A] text-[#005EB8] dark:text-sky-300 font-semibold shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {error && (
        <StatusBanner
          variant="error"
          message={error}
          onDismiss={() => setError(null)}
        />
      )}

      {notice && (
        <StatusBanner
          variant="success"
          message={notice}
          onDismiss={() => setNotice(null)}
        />
      )}

      {/* TAB: OVERVIEW */}
      {tab === 'overview' && overview && (
        <div className="space-y-5 sm:space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <HemaCard className="p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                PostgreSQL Status
              </div>
              <div className="mt-1 text-lg sm:text-xl font-bold text-teal-700 dark:text-teal-400 uppercase">
                {overview.health.database}
              </div>
            </HemaCard>
            <HemaCard className="p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Engine
              </div>
              <div className="mt-1 text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {overview.health.dialect}
              </div>
            </HemaCard>
            <HemaCard className="p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Round-Trip Latency
              </div>
              <div className="mt-1 text-lg sm:text-xl font-bold tabular-nums-mono text-[#005EB8] dark:text-sky-300">
                {overview.health.latencyMs} ms
              </div>
            </HemaCard>
            <HemaCard className="p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Last Checked
              </div>
              <div className="mt-1 text-[11px] sm:text-xs font-mono text-slate-700 dark:text-slate-300 truncate">
                {formatDateTime(overview.health.checkedAt)}
              </div>
            </HemaCard>
          </div>

          <HemaCard className="p-4 sm:p-5">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
              Schema Table Row Counts
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {Object.entries(overview.tableCounts).map(([table, count]) => (
                <div
                  key={table}
                  className="p-3.5 rounded-lg bg-[#F8FAFC] dark:bg-[#0D1622] border border-[#D5E0EC] dark:border-[#1E2E42]"
                >
                  <div className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                    {table}
                  </div>
                  <div className="mt-1 text-xl font-bold tabular-nums-mono text-slate-900 dark:text-slate-100">
                    {count}
                  </div>
                </div>
              ))}
            </div>
          </HemaCard>
        </div>
      )}

      {/* TAB: USERS & RBAC */}
      {tab === 'users' && (
        <HemaCard className="overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-[#D5E0EC] dark:border-[#1E2E42] flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Registered Accounts &amp; Role Assignments
            </h2>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              {usersList.length} accounts
            </span>
          </div>

          <div className="md:hidden divide-y divide-[#D5E0EC] dark:divide-[#1E2E42]">
            {usersList.map((u) => (
              <div key={u.uid} className="p-4 space-y-3 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                      {u.fullName || 'Unnamed User'}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {u.email}
                    </div>
                  </div>
                  <span className="font-mono text-[11px] font-medium text-[#005EB8] dark:text-sky-300 shrink-0">
                    {u.patientCode}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      Role
                    </label>
                    <select
                      value={u.role}
                      onChange={(e) =>
                        void handleUpdateUser(u.uid, {
                          role: e.target.value as UserRole,
                        })
                      }
                      className={mobileSelectClass}
                    >
                      <option value="consumer">consumer</option>
                      <option value="hospital_operator">
                        hospital_operator
                      </option>
                      <option value="clinician">clinician</option>
                      <option value="admin">admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      Status
                    </label>
                    <select
                      value={u.accountStatus}
                      onChange={(e) =>
                        void handleUpdateUser(u.uid, {
                          accountStatus: e.target.value as AccountStatus,
                        })
                      }
                      className={mobileSelectClass}
                    >
                      <option value="active">active</option>
                      <option value="pending">pending</option>
                      <option value="suspended">suspended</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      Assigned Clinic
                    </label>
                    <select
                      value={u.hospitalId ? String(u.hospitalId) : ''}
                      onChange={(e) =>
                        void handleUpdateUser(u.uid, {
                          hospitalId: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                      className={mobileSelectClass}
                    >
                      <option value="">Personal / Unassigned</option>
                      {hospitalsList.map((h) => (
                        <option key={h.id} value={String(h.id)}>
                          {h.name} ({h.hospitalCode})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className={tableHeaderRowClass}>
                  <th className="py-2.5 px-4 font-semibold">User / Email</th>
                  <th className="py-2.5 px-4 font-semibold">Patient Code</th>
                  <th className="py-2.5 px-4 font-semibold">Role</th>
                  <th className="py-2.5 px-4 font-semibold">Status</th>
                  <th className="py-2.5 px-4 font-semibold">Assigned Clinic</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D5E0EC] dark:divide-[#1E2E42]">
                {usersList.map((u) => (
                  <tr key={u.uid}>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {u.fullName || 'Unnamed User'}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {u.email}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-[#005EB8] dark:text-sky-300">
                      {u.patientCode}
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={u.role}
                        onChange={(e) =>
                          void handleUpdateUser(u.uid, {
                            role: e.target.value as UserRole,
                          })
                        }
                        className={selectClass}
                      >
                        <option value="consumer">consumer</option>
                        <option value="hospital_operator">
                          hospital_operator
                        </option>
                        <option value="clinician">clinician</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={u.accountStatus}
                        onChange={(e) =>
                          void handleUpdateUser(u.uid, {
                            accountStatus: e.target.value as AccountStatus,
                          })
                        }
                        className={selectClass}
                      >
                        <option value="active">active</option>
                        <option value="pending">pending</option>
                        <option value="suspended">suspended</option>
                      </select>
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={u.hospitalId ? String(u.hospitalId) : ''}
                        onChange={(e) =>
                          void handleUpdateUser(u.uid, {
                            hospitalId: e.target.value
                              ? Number(e.target.value)
                              : null,
                          })
                        }
                        className={selectClass}
                      >
                        <option value="">Personal / Unassigned</option>
                        {hospitalsList.map((h) => (
                          <option key={h.id} value={String(h.id)}>
                            {h.name} ({h.hospitalCode})
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </HemaCard>
      )}

      {/* TAB: HOSPITALS */}
      {tab === 'hospitals' && (
        <div className="space-y-5 sm:space-y-6">
          <HemaCard className="p-4 sm:p-5">
            <form
              onSubmit={handleCreateHospital}
              className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end"
            >
              <div className="flex-1 w-full">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Register New Hospital / Clinic
                </label>
                <input
                  type="text"
                  required
                  value={newHospitalName}
                  onChange={(e) => setNewHospitalName(e.target.value)}
                  placeholder="Facility Name"
                  className="w-full h-11 px-3 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
                />
              </div>
              <div className="flex-1 w-full">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Contact Email (optional)
                </label>
                <input
                  type="email"
                  value={newHospitalEmail}
                  onChange={(e) => setNewHospitalEmail(e.target.value)}
                  placeholder="lab@hospital.org"
                  className="w-full h-11 px-3 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
                />
              </div>
              <button
                type="submit"
                className="min-h-[44px] px-5 rounded-lg hn-btn-primary text-xs font-semibold whitespace-nowrap"
              >
                Add Facility
              </button>
            </form>
          </HemaCard>

          <HemaCard className="overflow-hidden">
            <div className="md:hidden divide-y divide-[#D5E0EC] dark:divide-[#1E2E42]">
              {hospitalsList.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  No hospitals or clinics registered yet.
                </div>
              ) : (
                hospitalsList.map((h) => (
                  <div
                    key={h.id}
                    className="p-4 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                        {h.name}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {h.hospitalCode} ·{' '}
                        {h.contactEmail || h.contactPhone || 'No contact'}
                      </div>
                    </div>
                    <select
                      value={h.accountStatus}
                      onChange={(e) =>
                        void handleHospitalStatus(
                          h.id,
                          e.target.value as AccountStatus,
                        )
                      }
                      className="h-9 px-2 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-xs text-slate-900 dark:text-slate-100 shrink-0"
                    >
                      <option value="active">active</option>
                      <option value="pending">pending</option>
                      <option value="suspended">suspended</option>
                    </select>
                  </div>
                ))
              )}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className={tableHeaderRowClass}>
                    <th className="py-2.5 px-4 font-semibold">Code</th>
                    <th className="py-2.5 px-4 font-semibold">Facility Name</th>
                    <th className="py-2.5 px-4 font-semibold">Contact</th>
                    <th className="py-2.5 px-4 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D5E0EC] dark:divide-[#1E2E42]">
                  {hospitalsList.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="py-8 text-center text-slate-500 dark:text-slate-400"
                      >
                        No hospitals or clinics registered yet.
                      </td>
                    </tr>
                  ) : (
                    hospitalsList.map((h) => (
                      <tr key={h.id}>
                        <td className="py-3 px-4 font-mono font-medium text-[#005EB8] dark:text-sky-300">
                          {h.hospitalCode}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                          {h.name}
                        </td>
                        <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                          {h.contactEmail || h.contactPhone || '—'}
                        </td>
                        <td className="py-3 px-4">
                          <select
                            value={h.accountStatus}
                            onChange={(e) =>
                              void handleHospitalStatus(
                                h.id,
                                e.target.value as AccountStatus,
                              )
                            }
                            className={selectClass}
                          >
                            <option value="active">active</option>
                            <option value="pending">pending</option>
                            <option value="suspended">suspended</option>
                          </select>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </HemaCard>
        </div>
      )}

      {/* TAB: PATIENTS */}
      {tab === 'patients' && (
        <div className="space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void loadTab('patients', patientQuery);
            }}
            className="flex flex-col sm:flex-row gap-2"
          >
            <input
              type="text"
              value={patientQuery}
              onChange={(e) => setPatientQuery(e.target.value)}
              placeholder="Search by UHID, full name, or email..."
              className="flex-1 h-11 px-3 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-white dark:bg-[#111B27] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
            />
            <button
              type="submit"
              className="min-h-[44px] px-5 rounded-lg hn-btn-primary text-xs font-semibold shrink-0 whitespace-nowrap"
            >
              Search Patients
            </button>
          </form>

          <HemaCard className="overflow-hidden">
            <div className="md:hidden divide-y divide-[#D5E0EC] dark:divide-[#1E2E42]">
              {patientsList.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  No matching patient records.
                </div>
              ) : (
                patientsList.map((p) => (
                  <div key={p.id} className="p-4 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                        {p.fullName}
                      </span>
                      <span className="font-mono font-semibold text-[#005EB8] dark:text-sky-300">
                        {p.uhid}
                      </span>
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">
                      {p.sex || '—'} · {p.dateOfBirth || 'No DOB'} ·{' '}
                      {p.email || p.phone || 'No contact'}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {formatDateTime(p.createdAt)}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className={tableHeaderRowClass}>
                    <th className="py-2.5 px-4 font-semibold">UHID</th>
                    <th className="py-2.5 px-4 font-semibold">Patient Name</th>
                    <th className="py-2.5 px-4 font-semibold">Sex / DOB</th>
                    <th className="py-2.5 px-4 font-semibold">Contact</th>
                    <th className="py-2.5 px-4 font-semibold">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D5E0EC] dark:divide-[#1E2E42]">
                  {patientsList.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-8 text-center text-slate-500 dark:text-slate-400"
                      >
                        No matching patient records.
                      </td>
                    </tr>
                  ) : (
                    patientsList.map((p) => (
                      <tr key={p.id}>
                        <td className="py-3 px-4 font-mono font-semibold text-[#005EB8] dark:text-sky-300">
                          {p.uhid}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                          {p.fullName}
                        </td>
                        <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                          {p.sex || '—'} · {p.dateOfBirth || '—'}
                        </td>
                        <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                          {p.email || p.phone || '—'}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-500 dark:text-slate-400">
                          {formatDateTime(p.createdAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </HemaCard>
        </div>
      )}

      {/* TAB: DEVICES & CALIBRATIONS */}
      {tab === 'devices' && (
        <div className="space-y-5 sm:space-y-6">
          <HemaCard className="overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-[#D5E0EC] dark:border-[#1E2E42] font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Registered Hardware &amp; Simulated Units ({devicesList.length})
            </div>
            <div className="md:hidden divide-y divide-[#D5E0EC] dark:divide-[#1E2E42]">
              {devicesList.map((d) => (
                <div key={d.id} className="p-4 text-xs space-y-1">
                  <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                    {d.deviceName}
                  </div>
                  <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {d.deviceIdentifier} · {d.deviceModel}
                  </div>
                  <div className="font-mono text-slate-600 dark:text-slate-300">
                    {d.connectionType} / {d.status} · Cal: {d.calibrationStatus}
                  </div>
                  <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    FW: {d.firmwareVersion || '—'} ·{' '}
                    {formatDateTime(d.lastCommunicationAt || d.lastConnectedAt)}
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className={tableHeaderRowClass}>
                    <th className="py-2.5 px-4 font-semibold">Device / Serial</th>
                    <th className="py-2.5 px-4 font-semibold">Mode / Status</th>
                    <th className="py-2.5 px-4 font-semibold">Calibration</th>
                    <th className="py-2.5 px-4 font-semibold">Firmware</th>
                    <th className="py-2.5 px-4 font-semibold">Last Comm</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D5E0EC] dark:divide-[#1E2E42]">
                  {devicesList.map((d) => (
                    <tr key={d.id}>
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {d.deviceName}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {d.deviceIdentifier} · {d.deviceModel}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 font-mono">
                        {d.connectionType} / {d.status}
                      </td>
                      <td className="py-2.5 px-4 font-mono">
                        {d.calibrationStatus}
                      </td>
                      <td className="py-2.5 px-4 font-mono">
                        {d.firmwareVersion || '—'}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-500 dark:text-slate-400">
                        {formatDateTime(
                          d.lastCommunicationAt || d.lastConnectedAt,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </HemaCard>

          <HemaCard className="overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-[#D5E0EC] dark:border-[#1E2E42] font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Calibration Records ({calibrationsList.length})
            </div>
            <div className="md:hidden divide-y divide-[#D5E0EC] dark:divide-[#1E2E42]">
              {calibrationsList.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  No calibration logs yet.
                </div>
              ) : (
                calibrationsList.map((c) => (
                  <div key={c.id} className="p-4 text-xs space-y-1">
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {c.sensorChannel}
                      </span>
                      <span className="font-mono">{c.calibrationStatus}</span>
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {c.calibrationCode} · {c.verifiedByName || '—'} ·{' '}
                      {formatDateTime(c.calibrationDate)}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className={tableHeaderRowClass}>
                    <th className="py-2.5 px-4 font-semibold">Code</th>
                    <th className="py-2.5 px-4 font-semibold">Channel</th>
                    <th className="py-2.5 px-4 font-semibold">Status</th>
                    <th className="py-2.5 px-4 font-semibold">Verified By</th>
                    <th className="py-2.5 px-4 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D5E0EC] dark:divide-[#1E2E42]">
                  {calibrationsList.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-6 text-center text-slate-500 dark:text-slate-400"
                      >
                        No calibration logs yet.
                      </td>
                    </tr>
                  ) : (
                    calibrationsList.map((c) => (
                      <tr key={c.id}>
                        <td className="py-2.5 px-4 font-mono">
                          {c.calibrationCode}
                        </td>
                        <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-slate-100">
                          {c.sensorChannel}
                        </td>
                        <td className="py-2.5 px-4 font-mono">
                          {c.calibrationStatus}
                        </td>
                        <td className="py-2.5 px-4">
                          {c.verifiedByName || '—'}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-500 dark:text-slate-400">
                          {formatDateTime(c.calibrationDate)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </HemaCard>

          <HemaCard className="overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-[#D5E0EC] dark:border-[#1E2E42] font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Recent Connection &amp; Diagnostic Events (
              {deviceEventsList.length})
            </div>
            <div className="divide-y divide-[#D5E0EC] dark:divide-[#1E2E42] max-h-64 overflow-y-auto text-xs">
              {deviceEventsList.map((ev) => (
                <div
                  key={ev.id}
                  className="px-4 sm:px-5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4"
                >
                  <div>
                    <span className="font-mono font-semibold text-[#005EB8] dark:text-sky-300">
                      [{ev.connectionMode.toUpperCase()} · {ev.eventType}]
                    </span>{' '}
                    <span className="text-slate-700 dark:text-slate-200">
                      {ev.message}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                    {formatDateTime(ev.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </HemaCard>
        </div>
      )}

      {/* TAB: SESSIONS & RESULTS */}
      {tab === 'sessions' && (
        <div className="space-y-5 sm:space-y-6">
          <HemaCard className="overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-[#D5E0EC] dark:border-[#1E2E42] font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Diagnostic Test Sessions ({sessionsList.length})
            </div>
            <div className="md:hidden divide-y divide-[#D5E0EC] dark:divide-[#1E2E42]">
              {sessionsList.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  No diagnostic sessions recorded yet.
                </div>
              ) : (
                sessionsList.map((s) => (
                  <div key={s.id} className="p-4 text-xs space-y-1">
                    <div className="flex justify-between gap-2">
                      <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {s.sessionCode}
                      </span>
                      <span className="font-mono">
                        {s.sessionStatus} ({s.completionStatus})
                      </span>
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">
                      {s.testMode} · {s.operatorName || '—'} ·{' '}
                      {formatDateTime(s.startedAt)}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className={tableHeaderRowClass}>
                    <th className="py-2.5 px-4 font-semibold">Session Code</th>
                    <th className="py-2.5 px-4 font-semibold">Mode</th>
                    <th className="py-2.5 px-4 font-semibold">Status</th>
                    <th className="py-2.5 px-4 font-semibold">Operator</th>
                    <th className="py-2.5 px-4 font-semibold">Started</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D5E0EC] dark:divide-[#1E2E42]">
                  {sessionsList.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-6 text-center text-slate-500 dark:text-slate-400"
                      >
                        No diagnostic sessions recorded yet.
                      </td>
                    </tr>
                  ) : (
                    sessionsList.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2.5 px-4 font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {s.sessionCode}
                        </td>
                        <td className="py-2.5 px-4 font-mono">{s.testMode}</td>
                        <td className="py-2.5 px-4 font-mono">
                          {s.sessionStatus} ({s.completionStatus})
                        </td>
                        <td className="py-2.5 px-4">{s.operatorName || '—'}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-500 dark:text-slate-400">
                          {formatDateTime(s.startedAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </HemaCard>

          <HemaCard className="overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-[#D5E0EC] dark:border-[#1E2E42] font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Recent Measurements Across Tenant Scope ({measurementsList.length})
            </div>
            <div className="md:hidden divide-y divide-[#D5E0EC] dark:divide-[#1E2E42]">
              {measurementsList.slice(0, 50).map((m) => (
                <div
                  key={m.id}
                  className="p-3.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {m.testName}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {m.isSimulated ? 'SIMULATED' : m.dataSource} ·{' '}
                      {formatDateTime(m.measuredAt)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono font-bold text-slate-900 dark:text-slate-100">
                      {formatMeasurementValue(m)} {m.unit}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {m.status} / {m.validationStatus}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className={tableHeaderRowClass}>
                    <th className="py-2.5 px-4 font-semibold">Test</th>
                    <th className="py-2.5 px-4 font-semibold">Value</th>
                    <th className="py-2.5 px-4 font-semibold">Status / Valid</th>
                    <th className="py-2.5 px-4 font-semibold">Source</th>
                    <th className="py-2.5 px-4 font-semibold">Recorded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D5E0EC] dark:divide-[#1E2E42]">
                  {measurementsList.slice(0, 50).map((m) => (
                    <tr key={m.id}>
                      <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-slate-100">
                        {m.testName}
                      </td>
                      <td className="py-2.5 px-4 font-mono">
                        {formatMeasurementValue(m)} {m.unit}
                      </td>
                      <td className="py-2.5 px-4 font-mono">
                        {m.status} / {m.validationStatus}
                      </td>
                      <td className="py-2.5 px-4 font-mono">
                        {m.isSimulated ? 'SIMULATED' : m.dataSource}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-500 dark:text-slate-400">
                        {formatDateTime(m.measuredAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </HemaCard>
        </div>
      )}

      {/* TAB: AUDIT LOGS */}
      {tab === 'audit' && (
        <HemaCard className="overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-[#D5E0EC] dark:border-[#1E2E42] font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            System Security &amp; Data Audit Trail ({auditList.length})
          </div>
          <div className="md:hidden divide-y divide-[#D5E0EC] dark:divide-[#1E2E42]">
            {auditList.map((a) => (
              <div key={a.id} className="p-4 text-xs space-y-1">
                <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                  {a.action}
                </div>
                <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {a.actorRole} · {a.entityType}
                  {a.entityId ? ` #${a.entityId}` : ''} · {a.ipAddress || '—'}
                </div>
                <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {formatDateTime(a.createdAt)}
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className={tableHeaderRowClass}>
                  <th className="py-2.5 px-4 font-semibold">Action</th>
                  <th className="py-2.5 px-4 font-semibold">Actor / Role</th>
                  <th className="py-2.5 px-4 font-semibold">Entity</th>
                  <th className="py-2.5 px-4 font-semibold">IP Address</th>
                  <th className="py-2.5 px-4 font-semibold">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D5E0EC] dark:divide-[#1E2E42]">
                {auditList.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2.5 px-4 font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {a.action}
                    </td>
                    <td className="py-2.5 px-4 font-mono">
                      {a.actorRole} · {a.userUid.slice(0, 12)}
                    </td>
                    <td className="py-2.5 px-4 font-mono">
                      {a.entityType}
                      {a.entityId ? ` #${a.entityId}` : ''}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-500 dark:text-slate-400">
                      {a.ipAddress || '—'}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-500 dark:text-slate-400">
                      {formatDateTime(a.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </HemaCard>
      )}

      {/* TAB: REFERENCE RANGES */}
      {tab === 'ranges' && (
        <HemaCard className="p-4 sm:p-6 max-w-2xl">
          <form onSubmit={handleSaveReferenceRange} className="space-y-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Configure Clinical Reference Ranges
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Updates apply immediately to server-side status validation and reference snapshots for newly captured tests.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Diagnostic Parameter
              </label>
              <select
                value={selectedRangeSlug}
                onChange={(e) => setSelectedRangeSlug(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
              >
                {testCatalog.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.testName} ({t.unit})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Min Normal
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  required
                  value={minNormalInput}
                  onChange={(e) => setMinNormalInput(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Max Normal
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  required
                  value={maxNormalInput}
                  onChange={(e) => setMaxNormalInput(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Borderline High
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={borderlineHighInput}
                  onChange={(e) => setBorderlineHighInput(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Critical High
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={criticalHighInput}
                  onChange={(e) => setCriticalHighInput(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg border border-[#D5E0EC] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0D1622] text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#005EB8] dark:focus:border-sky-400"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full sm:w-auto min-h-[44px] px-5 py-2 rounded-lg hn-btn-primary text-xs font-semibold whitespace-nowrap"
            >
              Save Reference Thresholds
            </button>
          </form>
        </HemaCard>
      )}
    </div>
  );
}
