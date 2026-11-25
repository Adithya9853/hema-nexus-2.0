import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity,
  ArrowLeft,
  Bell,
  Bluetooth,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cpu,
  Database,
  FileText,
  FlaskConical,
  Home,
  LayoutGrid,
  LogOut,
  Moon,
  RefreshCw,
  Settings,
  Sun,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useBle } from '../../contexts/BleContext.tsx';
import { useHemaData } from '../../contexts/HemaDataContext.tsx';
import { useSimulatedDevice } from '../../contexts/SimulatedDeviceContext.tsx';
import type { NavSection } from '../../types/hema.ts';
import { formatDateTime } from '../../utils/formatters.ts';
import { BrandLogo } from '../common/BrandLogo.tsx';

interface AppShellProps {
  activeSection: NavSection;
  onNavigate: (section: NavSection) => void;
  children: React.ReactNode;
}

const NAV_ITEMS: {
  id: NavSection;
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: 'home',
    label: 'Clinical Overview',
    shortLabel: 'Home',
    description: 'Patient summary, vitals & quick actions',
    icon: Home,
  },
  {
    id: 'device',
    label: 'Connect Device',
    shortLabel: 'Device',
    description: 'ESP32 BLE pairing & sensor calibration',
    icon: Bluetooth,
  },
  {
    id: 'simulator',
    label: 'Simulated Mode',
    shortLabel: 'Simulator',
    description: '9 blood biomarkers + vitals without hardware',
    icon: Cpu,
  },
  {
    id: 'tests',
    label: 'Test Center',
    shortLabel: 'Tests',
    description: 'Guided measurement workflow & lab log',
    icon: FlaskConical,
  },
  {
    id: 'history',
    label: 'Health History',
    shortLabel: 'History',
    description: 'Timeline, search, filters & comparisons',
    icon: Clock,
  },
  {
    id: 'trends',
    label: 'Health Trends',
    shortLabel: 'Trends',
    description: 'Longitudinal charts & normal intervals',
    icon: Activity,
  },
  {
    id: 'reports',
    label: 'Clinical Reports',
    shortLabel: 'Reports',
    description: 'Generate, preview & share clinical PDFs',
    icon: FileText,
  },
  {
    id: 'profile',
    label: 'Patient Profile',
    shortLabel: 'Profile',
    description: 'Patient identity, Health QR & workspace',
    icon: User,
  },
  {
    id: 'settings',
    label: 'Settings',
    shortLabel: 'Settings',
    description: 'Appearance, Bluetooth alerts & data privacy',
    icon: Settings,
  },
];

// Primary 5 thumb-reachable mobile destinations: Home, Tests, Device, History, Profile
const MOBILE_PRIMARY_TABS: NavSection[] = [
  'home',
  'tests',
  'device',
  'history',
  'profile',
];

export function AppShell({
  activeSection,
  onNavigate,
  children,
}: AppShellProps) {
  const { profile, theme, setThemeMode, signOutUser } = useAuth();
  const { state: bleState, deviceInfo } = useBle();
  const { state: simState, deviceInfo: simDeviceInfo } = useSimulatedDevice();
  const {
    notifications,
    queuedMeasurements,
    syncQueue,
    markNotificationRead,
    markAllNotificationsRead,
  } = useHemaData();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const notifContainerRef = useRef<HTMLDivElement>(null);

  const navItems =
    profile?.role === 'admin'
      ? [
          ...NAV_ITEMS,
          {
            id: 'admin' as NavSection,
            label: 'Database Admin',
            shortLabel: 'Admin',
            description: 'PostgreSQL health, RBAC & audit logs',
            icon: Database,
          },
        ]
      : NAV_ITEMS;

  const mobileSecondaryItems = navItems.filter(
    (item) => !MOBILE_PRIMARY_TABS.includes(item.id),
  );

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const activeNavMeta = navItems.find((i) => i.id === activeSection);
  const isSecondaryMobileRoute =
    activeSection !== 'home' && !MOBILE_PRIMARY_TABS.includes(activeSection);

  useEffect(() => {
    if (!notifOpen && !workspaceOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNotifOpen(false);
        setWorkspaceOpen(false);
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (
        notifOpen &&
        notifContainerRef.current &&
        !notifContainerRef.current.contains(e.target as Node)
      ) {
        setNotifOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [notifOpen, workspaceOpen]);

  const navigateAndClose = (section: NavSection) => {
    setNotifOpen(false);
    setWorkspaceOpen(false);
    onNavigate(section);
  };

  const handleMobileBack = () => {
    if (activeSection === 'simulator') {
      navigateAndClose('device');
      return;
    }
    if (activeSection === 'settings') {
      navigateAndClose('profile');
      return;
    }
    navigateAndClose('home');
  };

  const handleSyncQueue = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await syncQueue();
      if (res.remainingCount > 0) {
        setSyncError(
          `${res.remainingCount} queued measurement(s) still awaiting server connection.`,
        );
      }
    } catch (err) {
      setSyncError(
        err instanceof Error ? err.message : 'Unable to sync queued items.',
      );
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F6FA] dark:bg-[#0B121B] text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Hospital Navy Sidebar */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 bg-[#0B2239] text-slate-100 border-r border-[#173657] transition-[width] duration-200 ${
          sidebarCollapsed ? 'w-[76px]' : 'w-[258px]'
        }`}
      >
        <div className="h-16 px-4 flex items-center justify-between border-b border-[#173657]">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded-lg"
            title="Hema Nexus Clinical Overview"
          >
            <BrandLogo
              size="sm"
              showWordmark={!sidebarCollapsed}
              tone="light"
            />
          </button>

          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            aria-label={
              sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
            }
            className="h-8 w-8 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors shrink-0"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        <nav
          className="flex-1 px-3 py-4 space-y-1 overflow-y-auto"
          aria-label="Primary Navigation"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                title={sidebarCollapsed ? item.label : undefined}
                className={`relative w-full min-h-[42px] px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-3 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'text-white bg-white/12'
                    : 'text-slate-300 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="sidebarActiveIndicator"
                    className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-sky-400"
                  />
                )}
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-sky-300' : ''
                  }`}
                />
                {!sidebarCollapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-[#173657] space-y-2">
          {!sidebarCollapsed && (
            <div className="px-3 py-2.5 rounded-lg bg-[#081829] border border-[#1E3F66] text-xs">
              <div className="text-slate-400">Instrument Telemetry</div>
              <div className="mt-0.5 font-medium text-white truncate">
                {bleState === 'connected' && deviceInfo
                  ? deviceInfo.name
                  : simState === 'connected' && simDeviceInfo
                    ? 'SIMULATED · ESP32-SIM'
                    : 'No active BLE link'}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => void signOutUser()}
            title="Sign Out"
            className="w-full min-h-[40px] px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/[0.08] flex items-center gap-3 transition-colors whitespace-nowrap"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!sidebarCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main Clinical Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Clinical Top App Bar */}
        <header className="sticky top-0 z-30 pt-safe bg-white/95 dark:bg-[#0F1926]/95 backdrop-blur-md border-b border-[#D5E0EC] dark:border-[#1E2E42]">
          <div className="h-[52px] lg:h-16 px-3.5 sm:px-6 lg:px-8 flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              {isSecondaryMobileRoute ? (
                <button
                  type="button"
                  onClick={handleMobileBack}
                  aria-label="Go back"
                  className="lg:hidden h-10 w-10 -ml-1 rounded-lg flex items-center justify-center text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95 transition-transform shrink-0"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => navigateAndClose('home')}
                  aria-label="Hema Nexus Home"
                  className="lg:hidden shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                >
                  <BrandLogo size="sm" showWordmark={false} />
                </button>
              )}

              <div className="min-w-0">
                <div className="text-sm lg:text-base font-display font-semibold tracking-tight truncate flex items-center gap-2">
                  <span className="truncate">
                    {activeSection === 'home'
                      ? 'Hema Nexus'
                      : activeNavMeta?.label || 'Hema Nexus'}
                  </span>
                  {simState === 'connected' && (
                    <button
                      type="button"
                      onClick={() => navigateAndClose('simulator')}
                      className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-500/40 text-amber-900 dark:text-amber-200 font-mono text-[10px] font-bold uppercase shrink-0"
                    >
                      SIM
                    </button>
                  )}
                  {bleState === 'connected' && (
                    <button
                      type="button"
                      onClick={() => navigateAndClose('device')}
                      className="lg:hidden px-1.5 py-0.5 rounded bg-teal-100 dark:bg-teal-950/60 border border-teal-300 dark:border-teal-500/40 text-teal-900 dark:text-teal-200 font-mono text-[10px] font-bold uppercase shrink-0"
                    >
                      BLE
                    </button>
                  )}
                </div>
                <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {profile?.fullName || profile?.email}
                  </span>
                  {profile?.patientCode && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums-mono">
                        {profile.patientCode}
                      </span>
                    </>
                  )}
                  {profile?.role && profile.role !== 'consumer' && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono uppercase text-[11px] text-[#005EB8] dark:text-sky-300 font-medium">
                        {profile.role.replace('_', ' ')}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
              {queuedMeasurements.length > 0 && (
                <button
                  type="button"
                  onClick={handleSyncQueue}
                  disabled={syncing}
                  aria-label={`Sync ${queuedMeasurements.length} queued readings`}
                  className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 active:scale-95 transition-transform"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`}
                  />
                  <span>Sync ({queuedMeasurements.length})</span>
                </button>
              )}

              <button
                type="button"
                onClick={() =>
                  void setThemeMode(theme === 'dark' ? 'light' : 'dark')
                }
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                className="h-10 w-10 rounded-lg border border-[#D5E0EC] dark:border-[#1E2E42] bg-[#F8FAFC] dark:bg-[#111B27] hover:bg-slate-100 dark:hover:bg-[#172436] flex items-center justify-center transition-colors active:scale-95 shrink-0"
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-sky-300" />
                ) : (
                  <Moon className="w-4 h-4 text-slate-700" />
                )}
              </button>

              <div className="relative" ref={notifContainerRef}>
                <button
                  type="button"
                  onClick={() => {
                    setWorkspaceOpen(false);
                    setNotifOpen((o) => !o);
                  }}
                  aria-label="Clinical Alerts & Notifications"
                  aria-expanded={notifOpen}
                  className="relative h-10 w-10 rounded-lg border border-[#D5E0EC] dark:border-[#1E2E42] bg-[#F8FAFC] dark:bg-[#111B27] hover:bg-slate-100 dark:hover:bg-[#172436] flex items-center justify-center transition-colors active:scale-95 shrink-0"
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded bg-[#005EB8] dark:bg-sky-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums-mono">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>

                <AnimatePresence>
                  {notifOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.98 }}
                      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                      className="fixed inset-x-3 top-14 sm:absolute sm:inset-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96 rounded-xl bg-white dark:bg-[#111B27] border border-[#D5E0EC] dark:border-[#1E2E42] shadow-xl z-50 overflow-hidden"
                    >
                      <div className="px-4 py-3 border-b border-[#E2E8F0] dark:border-[#1E2E42] flex items-center justify-between gap-2 bg-[#F8FAFC] dark:bg-[#0D1622]">
                        <span className="text-sm font-semibold">
                          Clinical Alerts ({unreadCount} unread)
                        </span>
                        <div className="flex items-center gap-2">
                          {unreadCount > 0 && (
                            <button
                              type="button"
                              onClick={() => void markAllNotificationsRead()}
                              className="min-h-[32px] px-2 text-xs font-medium text-[#005EB8] dark:text-sky-300 hover:underline flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Mark read
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setNotifOpen(false)}
                            aria-label="Close notifications"
                            className="sm:hidden h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/10"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="max-h-[65dvh] sm:max-h-80 overflow-y-auto divide-y divide-[#E2E8F0] dark:divide-[#1E2E42]">
                        {notifications.length === 0 ? (
                          <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                            No alerts logged. Device events, clinical range notifications, and generated PDF reports appear here.
                          </div>
                        ) : (
                          notifications.map((n) => (
                            <button
                              key={n.id}
                              type="button"
                              onClick={() => void markNotificationRead(n.id)}
                              className={`w-full text-left px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors ${
                                n.isRead
                                  ? 'opacity-65'
                                  : 'bg-sky-50/60 dark:bg-sky-950/25'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold">
                                  {n.title}
                                </span>
                                <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums-mono shrink-0">
                                  {formatDateTime(n.createdAt)}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                {n.message}
                              </p>
                            </button>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Mobile Workspace Hub Trigger */}
              <button
                type="button"
                onClick={() => {
                  setNotifOpen(false);
                  setWorkspaceOpen(true);
                }}
                aria-label="Open clinical modules menu"
                className="lg:hidden h-10 w-10 rounded-lg border border-[#D5E0EC] dark:border-[#1E2E42] bg-[#F8FAFC] dark:bg-[#111B27] hover:bg-slate-100 dark:hover:bg-[#172436] flex items-center justify-center transition-colors active:scale-95 shrink-0"
              >
                <LayoutGrid className="w-4 h-4 text-[#005EB8] dark:text-sky-300" />
              </button>

              <button
                type="button"
                onClick={() => onNavigate('tests')}
                className="hidden sm:inline-flex min-h-[40px] px-4 py-2 rounded-lg hn-btn-primary text-xs font-semibold transition-colors whitespace-nowrap shrink-0 items-center gap-2"
              >
                <FlaskConical className="w-3.5 h-3.5" />
                <span>Start Test</span>
              </button>
            </div>
          </div>
        </header>

        {/* Scrollable Workspace Content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 lg:pb-10 max-w-[1320px] w-full mx-auto">
          {syncError && (
            <div
              role="alert"
              className="mb-4 p-3.5 rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/35 text-xs text-amber-900 dark:text-amber-100 flex items-center justify-between gap-3"
            >
              <span>{syncError}</span>
              <button
                type="button"
                onClick={() => setSyncError(null)}
                aria-label="Dismiss sync notice"
                className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile All-Modules Slide-Up Sheet */}
      <AnimatePresence>
        {workspaceOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setWorkspaceOpen(false)}
            className="lg:hidden fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-end"
          >
            <motion.div
              initial={{ y: 48, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 48, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Clinical Modules Menu"
              className="w-full max-h-[88dvh] overflow-y-auto rounded-t-2xl bg-white dark:bg-[#111B27] border-t border-[#D5E0EC] dark:border-[#1E2E42] px-4 pt-2.5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] shadow-2xl space-y-4"
            >
              <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mx-auto" />

              <div className="flex items-center justify-between gap-3 px-1 pb-2.5 border-b border-[#E2E8F0] dark:border-[#1E2E42]">
                <div className="min-w-0">
                  <div className="text-sm font-display font-bold truncate">
                    {profile?.fullName || profile?.email}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                    {profile?.patientCode}
                    {bleState === 'connected' && deviceInfo
                      ? ` · BLE: ${deviceInfo.name}`
                      : simState === 'connected'
                        ? ' · SIMULATION Active'
                        : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setWorkspaceOpen(false)}
                  aria-label="Close workspace menu"
                  className="h-10 w-10 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {mobileSecondaryItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeSection === item.id;
                  const isSimulator = item.id === 'simulator';
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigateAndClose(item.id)}
                      className={`min-h-[56px] px-3.5 py-2.5 rounded-xl border text-left flex items-center justify-between gap-3 active:scale-[0.99] transition-colors ${
                        active
                          ? 'border-[#005EB8] dark:border-sky-400 bg-sky-50 dark:bg-sky-950/30 text-[#005EB8] dark:text-sky-300'
                          : isSimulator
                            ? 'border-amber-300 dark:border-amber-500/40 bg-amber-50/70 dark:bg-amber-950/20 text-slate-900 dark:text-amber-100'
                            : 'border-[#D5E0EC] dark:border-[#1E2E42] bg-[#F8FAFC] dark:bg-[#0D1622] text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      <span className="flex items-center gap-3 min-w-0">
                        <span
                          className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                            isSimulator
                              ? 'bg-amber-600 text-white'
                              : active
                                ? 'bg-[#005EB8] dark:bg-sky-500 text-white'
                                : 'bg-white dark:bg-[#111B27] text-[#005EB8] dark:text-sky-300 border border-[#D5E0EC] dark:border-[#1E2E42]'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold truncate">
                            {item.label}
                          </span>
                          <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {item.description}
                          </span>
                        </span>
                      </span>

                      <span className="flex items-center gap-2 shrink-0">
                        {isSimulator && (
                          <span className="font-mono text-[10px] font-bold uppercase text-amber-800 dark:text-amber-300">
                            {simState === 'connected' ? 'ACTIVE' : 'SIMULATION'}
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => {
                  setWorkspaceOpen(false);
                  void signOutUser();
                }}
                className="w-full min-h-[46px] px-4 py-2.5 rounded-xl border border-rose-300 dark:border-rose-500/35 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-sm font-medium flex items-center justify-center gap-2 active:scale-[0.99] transition-transform"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Primary Mobile Bottom Navigation */}
      <nav
        aria-label="Mobile Navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 pb-safe bg-white/95 dark:bg-[#0F1926]/95 backdrop-blur-md border-t border-[#D5E0EC] dark:border-[#1E2E42]"
      >
        <div className="h-[58px] grid grid-cols-5 items-center">
          {MOBILE_PRIMARY_TABS.map((id) => {
            const item = NAV_ITEMS.find((n) => n.id === id)!;
            const Icon = item.icon;
            const isActive = activeSection === id && !workspaceOpen;
            return (
              <button
                key={id}
                type="button"
                onClick={() => navigateAndClose(id)}
                className={`relative flex flex-col items-center justify-center gap-1 min-h-[48px] text-[10px] font-medium tracking-tight transition-colors active:scale-95 ${
                  isActive
                    ? 'text-[#005EB8] dark:text-sky-300 font-semibold'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="w-[20px] h-[20px]" />
                <span className="truncate max-w-full px-1">
                  {item.shortLabel}
                </span>
                {isActive && (
                  <motion.span
                    layoutId="mobileBottomTabIndicator"
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute top-0 h-[3px] w-7 rounded-b bg-[#005EB8] dark:bg-sky-400"
                  />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
