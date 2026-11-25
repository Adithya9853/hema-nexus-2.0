import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { AuthGate } from './components/common/AuthGate.tsx';
import { CinematicIntro } from './components/common/CinematicIntro.tsx';
import { AppShell } from './components/layout/AppShell.tsx';
import { MeasurementWorkflowModal } from './components/tests/MeasurementWorkflowModal.tsx';
import { AuthProvider, useAuth } from './contexts/AuthContext.tsx';
import { BleProvider } from './contexts/BleContext.tsx';
import { HemaDataProvider, useHemaData } from './contexts/HemaDataContext.tsx';
import { SimulatedDeviceProvider } from './contexts/SimulatedDeviceContext.tsx';
import type { NavSection, TestTypeRecord } from './types/hema.ts';

const AdminDashboardPage = lazy(() =>
  import('./pages/AdminDashboardPage.tsx').then((m) => ({
    default: m.AdminDashboardPage,
  })),
);
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage.tsx').then((m) => ({
    default: m.DashboardPage,
  })),
);
const DeviceManagementPage = lazy(() =>
  import('./pages/DeviceManagementPage.tsx').then((m) => ({
    default: m.DeviceManagementPage,
  })),
);
const HealthHistoryPage = lazy(() =>
  import('./pages/HealthHistoryPage.tsx').then((m) => ({
    default: m.HealthHistoryPage,
  })),
);
const HealthTrendsPage = lazy(() =>
  import('./pages/HealthTrendsPage.tsx').then((m) => ({
    default: m.HealthTrendsPage,
  })),
);
const ProfilePage = lazy(() =>
  import('./pages/ProfilePage.tsx').then((m) => ({ default: m.ProfilePage })),
);
const ReportsPage = lazy(() =>
  import('./pages/ReportsPage.tsx').then((m) => ({ default: m.ReportsPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage.tsx').then((m) => ({ default: m.SettingsPage })),
);
const SimulatorTestingPage = lazy(() =>
  import('./pages/SimulatorTestingPage.tsx').then((m) => ({
    default: m.SimulatorTestingPage,
  })),
);
const TestCenterPage = lazy(() =>
  import('./pages/TestCenterPage.tsx').then((m) => ({
    default: m.TestCenterPage,
  })),
);

const INTRO_SESSION_KEY = 'hema_nexus_intro_seen';

const SECTION_PATHS: Record<NavSection, string> = {
  home: '/',
  device: '/device',
  simulator: '/simulator',
  tests: '/tests',
  history: '/history',
  trends: '/trends',
  reports: '/reports',
  profile: '/profile',
  settings: '/settings',
  admin: '/admin',
};

function parseRoutePath(pathname: string): {
  section: NavSection;
  unknownPath: string | null;
} {
  const normalized =
    pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname || '/';
  if (normalized === '' || normalized === '/') {
    return { section: 'home', unknownPath: null };
  }
  const matched = (Object.entries(SECTION_PATHS) as [NavSection, string][]).find(
    ([, path]) => path === normalized,
  );
  if (matched) {
    return { section: matched[0], unknownPath: null };
  }
  return { section: 'home', unknownPath: normalized };
}

function HemaNexusWorkspace() {
  const { isAuthenticated, loading } = useAuth();
  const { testCatalog } = useHemaData();

  const [showIntro, setShowIntro] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(INTRO_SESSION_KEY) !== '1';
    } catch {
      return true;
    }
  });

  const [routeState, setRouteState] = useState<{
    section: NavSection;
    unknownPath: string | null;
  }>(() =>
    typeof window !== 'undefined'
      ? parseRoutePath(window.location.pathname)
      : { section: 'home', unknownPath: null },
  );

  const [workflowTarget, setWorkflowTarget] = useState<{
    test: TestTypeRecord;
    mode?: 'ble' | 'manual';
  } | null>(null);

  useEffect(() => {
    const handlePopState = () => {
      setRouteState(parseRoutePath(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleNavigate = useCallback((section: NavSection) => {
    setRouteState({ section, unknownPath: null });
    const nextPath = SECTION_PATHS[section] || '/';
    if (
      typeof window !== 'undefined' &&
      window.location.pathname !== nextPath
    ) {
      window.history.pushState({ section }, '', nextPath);
    }
  }, []);

  const handleIntroComplete = useCallback(() => {
    try {
      sessionStorage.setItem(INTRO_SESSION_KEY, '1');
    } catch {
      // Ignore storage restriction
    }
    setShowIntro(false);
  }, []);

  const handleReplayIntro = useCallback(() => {
    setShowIntro(true);
  }, []);

  const handleStartTestBySlug = useCallback(
    (slug: string, mode?: 'ble' | 'manual') => {
      const found = testCatalog.find((t) => t.slug === slug);
      if (found) {
        setWorkflowTarget({ test: found, mode });
      } else {
        handleNavigate('tests');
      }
    },
    [testCatalog, handleNavigate],
  );

  if (showIntro) {
    return <CinematicIntro onComplete={handleIntroComplete} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F3F6FA] dark:bg-[#0B121B] text-slate-900 dark:text-slate-100 flex items-center justify-center">
        <div className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Restoring Hema Nexus clinical session...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthGate />;
  }

  const activeSection = routeState.section;

  return (
    <>
      <AppShell activeSection={activeSection} onNavigate={handleNavigate}>
        <Suspense
          fallback={
            <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
              Loading clinical module...
            </div>
          }
        >
          {routeState.unknownPath ? (
            <div className="rounded-xl bg-white dark:bg-[#111B27] border border-[#D5E0EC] dark:border-[#1E2E42] p-8 text-center max-w-lg mx-auto my-10 space-y-3">
              <div className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400">
                404 · Route Not Found
              </div>
              <h1 className="font-display text-xl font-bold">
                Page Unavailable
              </h1>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                The requested path{' '}
                <span className="font-mono">{routeState.unknownPath}</span> does
                not exist in the Hema Nexus workspace.
              </p>
              <button
                type="button"
                onClick={() => handleNavigate('home')}
                className="min-h-[42px] px-4 py-2 rounded-lg hn-btn-primary text-xs font-semibold"
              >
                Return to Clinical Overview
              </button>
            </div>
          ) : (
            <>
              {activeSection === 'home' && (
                <DashboardPage
                  onNavigate={handleNavigate}
                  onStartTest={handleStartTestBySlug}
                />
              )}
              {activeSection === 'device' && (
                <DeviceManagementPage
                  onOpenSimulator={() => handleNavigate('simulator')}
                />
              )}
              {activeSection === 'simulator' && (
                <SimulatorTestingPage onNavigate={handleNavigate} />
              )}
              {activeSection === 'tests' && (
                <TestCenterPage
                  onSelectTest={(test, mode) =>
                    setWorkflowTarget({ test, mode })
                  }
                  onOpenSimulator={() => handleNavigate('simulator')}
                />
              )}
              {activeSection === 'history' && <HealthHistoryPage />}
              {activeSection === 'trends' && <HealthTrendsPage />}
              {activeSection === 'reports' && <ReportsPage />}
              {activeSection === 'profile' && (
                <ProfilePage onNavigate={handleNavigate} />
              )}
              {activeSection === 'settings' && (
                <SettingsPage
                  onReplayIntro={handleReplayIntro}
                  onNavigate={handleNavigate}
                />
              )}
              {activeSection === 'admin' && <AdminDashboardPage />}
            </>
          )}
        </Suspense>
      </AppShell>

      {workflowTarget && (
        <MeasurementWorkflowModal
          test={workflowTarget.test}
          initialMode={workflowTarget.mode}
          onClose={() => setWorkflowTarget(null)}
          onSelectTest={(nextTest) =>
            setWorkflowTarget((prev) =>
              prev ? { ...prev, test: nextTest } : { test: nextTest },
            )
          }
          onGoToDevice={() => handleNavigate('device')}
          onOpenSimulator={() => handleNavigate('simulator')}
          onGoToReports={() => handleNavigate('reports')}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BleProvider>
        <SimulatedDeviceProvider>
          <HemaDataProvider>
            <HemaNexusWorkspace />
          </HemaDataProvider>
        </SimulatedDeviceProvider>
      </BleProvider>
    </AuthProvider>
  );
}
