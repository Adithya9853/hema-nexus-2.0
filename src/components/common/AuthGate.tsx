import { useState } from 'react';
import {
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { BRAND_ASSETS, BRAND_IDENTITY } from '../../config/assets.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';
import type { UserRole } from '../../types/hema.ts';

type AuthMode = 'login' | 'register';

export function AuthGate() {
  const { signInWithGoogle, signInWithEmail, registerWithEmail, authError } =
    useAuth();
  const [signingInGoogle, setSigningInGoogle] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<AuthMode>('login');
  const [localError, setLocalError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('consumer');
  const [hospitalName, setHospitalName] = useState('');

  const handleGoogleSignIn = async () => {
    setLocalError(null);
    setSigningInGoogle(true);
    try {
      await signInWithGoogle();
    } catch {
      // Surfaced via AuthContext
    } finally {
      setSigningInGoogle(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await signInWithEmail(email.trim(), password);
      } else {
        if (
          (role === 'hospital_operator' || role === 'clinician') &&
          !hospitalName.trim()
        ) {
          setLocalError(
            'Enter your Hospital or Clinic Name for clinic staff accounts.',
          );
          setSubmitting(false);
          return;
        }
        await registerWithEmail({
          email: email.trim(),
          password,
          fullName: fullName.trim() || undefined,
          phone: phone.trim() || undefined,
          role,
          hospitalName: hospitalName.trim() || undefined,
        });
      }
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Authentication failed.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const displayError = localError || authError;

  return (
    <div className="min-h-screen bg-[#F3F6FA] dark:bg-[#0B121B] text-slate-900 dark:text-slate-100 flex flex-col lg:flex-row">
      {/* Left column: Clinical Portal Authentication */}
      <div className="flex-1 flex flex-col justify-between p-4 sm:p-10 lg:p-14 pt-safe max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-[#0B2239] p-1.5 border border-[#1E3F66] flex items-center justify-center shrink-0">
            <img
              src={BRAND_ASSETS.officialLogo}
              alt="Hema Nexus Official Logo"
              referrerPolicy="no-referrer"
              className="h-full w-full object-contain"
            />
          </div>
          <div>
            <div className="font-display text-lg font-bold tracking-tight">
              {BRAND_IDENTITY.name}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Clinical &amp; Patient Health Portal
            </div>
          </div>
        </div>

        <div className="my-6 sm:my-8 space-y-5">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
              Patient diagnostics, vital signs telemetry, and clinical reports.
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-lg">
              Sign in with Google or your hospital/patient credentials to access laboratory readings, connected hardware sessions, and downloadable PDF summaries.
            </p>
          </div>

          <div className="rounded-xl bg-white dark:bg-[#111B27] border border-[#D5E0EC] dark:border-[#1E2E42] p-4 sm:p-6 space-y-4 shadow-xs">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={signingInGoogle || submitting}
              className="w-full min-h-[46px] px-5 py-2.5 rounded-lg hn-btn-primary font-semibold text-sm transition-colors flex items-center justify-center gap-2.5 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              <span>
                {signingInGoogle
                  ? 'Opening Google Sign-In...'
                  : 'Continue with Google'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="relative flex items-center justify-center">
              <div className="border-t border-[#E2E8F0] dark:border-[#1E2E42] w-full" />
              <span className="px-3 bg-white dark:bg-[#111B27] text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                or sign in with account credentials
              </span>
              <div className="border-t border-[#E2E8F0] dark:border-[#1E2E42] w-full" />
            </div>

            <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[#F1F5F9] dark:bg-[#0B121B] border border-[#D5E0EC] dark:border-[#1E2E42]">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setLocalError(null);
                }}
                className={`min-h-[38px] py-1.5 rounded-md text-xs font-medium transition-colors ${
                  mode === 'login'
                    ? 'bg-white dark:bg-[#172436] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setLocalError(null);
                }}
                className={`min-h-[38px] py-1.5 rounded-md text-xs font-medium transition-colors ${
                  mode === 'register'
                    ? 'bg-white dark:bg-[#172436] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Register Account
              </button>
            </div>

            {displayError && (
              <div
                role="alert"
                className="p-3 rounded-lg border border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-800 dark:text-rose-200"
              >
                {displayError}
              </div>
            )}

            <form onSubmit={handleEmailSubmit} className="space-y-3.5">
              {mode === 'register' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={120}
                      autoComplete="name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Dr. Priya Nair"
                      className="w-full h-11 px-3 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0B121B] text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Account Role
                    </label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as UserRole)}
                      className="w-full h-11 px-3 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0B121B] text-sm"
                    >
                      <option value="consumer">Patient / Personal User</option>
                      <option value="hospital_operator">
                        Hospital / Clinic Operator
                      </option>
                      <option value="clinician">Clinician / Physician</option>
                    </select>
                  </div>
                </div>
              )}

              {mode === 'register' &&
                (role === 'hospital_operator' || role === 'clinician') && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-[#005EB8] dark:text-sky-400" />
                        <span>Hospital / Clinic Name *</span>
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={140}
                        value={hospitalName}
                        onChange={(e) => setHospitalName(e.target.value)}
                        placeholder="Metro Diagnostics Lab"
                        className="w-full h-11 px-3 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0B121B] text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        maxLength={40}
                        autoComplete="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+91 98000 00000"
                        className="w-full h-11 px-3 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0B121B] text-sm"
                      />
                    </div>
                  </div>
                )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span>Email Address</span>
                  </label>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@hospital.org"
                    className="w-full h-11 px-3 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0B121B] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                    <span>Password</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      autoComplete={
                        mode === 'login' ? 'current-password' : 'new-password'
                      }
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (localError) setLocalError(null);
                      }}
                      placeholder="Min. 8 characters"
                      className="w-full h-11 pl-3 pr-11 rounded-lg border border-[#CBD5E1] dark:border-[#24364D] bg-[#F8FAFC] dark:bg-[#0B121B] text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={
                        showPassword ? 'Hide password' : 'Show password'
                      }
                      className="absolute right-1.5 top-1.5 h-8 w-8 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || signingInGoogle}
                className="w-full min-h-[44px] px-4 py-2 rounded-lg bg-[#0B2239] dark:bg-[#17283D] hover:bg-[#133252] dark:hover:bg-[#1E3450] border border-transparent dark:border-[#294364] text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60 transition-colors"
              >
                {mode === 'register' ? (
                  <>
                    <UserPlus className="w-4 h-4 text-sky-300" />
                    <span>
                      {submitting
                        ? 'Creating Account...'
                        : 'Create Clinical Account'}
                    </span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4 text-sky-300" />
                    <span>
                      {submitting ? 'Signing In...' : 'Sign In with Email'}
                    </span>
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="border-t border-[#D5E0EC] dark:border-[#1E2E42] pt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
              Role-Based Access Control
            </span>
            <span aria-hidden="true">·</span>
            <span>13 Biomarkers &amp; Vitals</span>
            <span aria-hidden="true">·</span>
            <span>ESP32 BLE &amp; Simulated Mode</span>
            <span aria-hidden="true">·</span>
            <span>Clinical PDF Summary</span>
          </div>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-500">
          Hema Nexus Clinical Companion · Authorized patient and hospital sessions only
        </p>
      </div>

      {/* Right column: Physical Diagnostic Device Bay */}
      <div className="lg:w-[45%] bg-[#0B2239] text-white p-6 sm:p-10 lg:p-14 pb-safe flex flex-col justify-center items-center border-t lg:border-t-0 lg:border-l border-[#173657]">
        <div className="w-full max-w-lg">
          <div className="text-xs font-mono text-sky-300 mb-3">
            MULTI-PARAMETER CLINICAL INSTRUMENT
          </div>
          <div className="rounded-xl border border-[#1E3F66] bg-[#081829] p-4 sm:p-6">
            <img
              src={BRAND_ASSETS.productPhoto}
              alt="Hema Nexus Physical Medical Device"
              referrerPolicy="no-referrer"
              className="w-full h-auto max-h-[240px] sm:max-h-[340px] lg:max-h-[400px] object-contain mx-auto rounded-lg"
            />
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3 text-xs border-t border-[#1E3F66] pt-4 text-slate-300">
            <div>
              <div className="text-slate-400">Blood Bays</div>
              <div className="font-mono font-semibold text-white mt-0.5">
                Ports 1–9
              </div>
            </div>
            <div>
              <div className="text-slate-400">Hemodynamics</div>
              <div className="font-mono font-semibold text-white mt-0.5">
                BP &amp; SpO2
              </div>
            </div>
            <div>
              <div className="text-slate-400">Thermal Probe</div>
              <div className="font-mono font-semibold text-white mt-0.5">
                Port 7 Sensor
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
