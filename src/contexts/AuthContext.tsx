import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  activeFirebaseProjectId,
  auth,
  googleAuthProvider,
} from '../lib/firebase.ts';
import { apiRequest, registerTokenGetter } from '../services/api/client.ts';
import { clearQueueForUser } from '../services/sync/offlineQueue.ts';
import type { UserPreferences, UserProfile, UserRole } from '../types/hema.ts';

// Local HMAC session token kept strictly in JS memory (never localStorage/sessionStorage).
let inMemoryLocalToken: string | null = null;

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  isAuthenticated: boolean;
  loading: boolean;
  authError: string | null;
  theme: 'light' | 'dark';
  setThemeMode: (mode: UserPreferences['theme']) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (payload: {
    email: string;
    password: string;
    fullName?: string;
    phone?: string;
    role?: UserRole;
    hospitalName?: string;
  }) => Promise<void>;
  signOutUser: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (patch: {
    fullName?: string | null;
    phone?: string | null;
    dateOfBirth?: string | null;
    preferences?: UserPreferences;
  }) => Promise<UserProfile>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const THEME_OVERRIDE_KEY = 'hema_nexus_theme_explicit';

function getInitialThemeMode(): UserPreferences['theme'] {
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(THEME_OVERRIDE_KEY);
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        return saved;
      }
    } catch {
      // Ignore storage access errors
    }
  }
  return 'light';
}

function resolveTheme(mode: UserPreferences['theme']): 'light' | 'dark' {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  if (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }
  return 'light';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [themeMode, setLocalThemeMode] =
    useState<UserPreferences['theme']>(getInitialThemeMode);

  const resolvedTheme = resolveTheme(themeMode);
  const isAuthenticated = Boolean(firebaseUser || profile);

  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute(
        'content',
        resolvedTheme === 'dark' ? '#0B121B' : '#F3F6FA',
      );
    }
  }, [resolvedTheme]);

  useEffect(() => {
    registerTokenGetter(async () => {
      if (inMemoryLocalToken) {
        return inMemoryLocalToken;
      }
      const current = auth.currentUser;
      if (!current) return null;
      return current.getIdToken();
    });

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        if (!inMemoryLocalToken) {
          setProfile(null);
        }
        setLoading(false);
        return;
      }

      inMemoryLocalToken = null;
      try {
        const res = await apiRequest<{ profile: UserProfile }>('/api/profile', {
          method: 'GET',
        });
        setProfile(res.profile);
        if (res.profile?.preferences?.theme) {
          try {
            const explicit = window.localStorage.getItem(THEME_OVERRIDE_KEY);
            if (explicit) {
              setLocalThemeMode(res.profile.preferences.theme);
            }
          } catch {
            // Keep default dark primary aesthetic
          }
        }
        setAuthError(null);
      } catch (err) {
        console.error('Failed to load user profile:', err);
        setAuthError(
          err instanceof Error
            ? err.message
            : 'Unable to synchronize account profile.',
        );
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    inMemoryLocalToken = null;
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/popup-closed-by-user') {
        setAuthError('Sign-in popup was closed before completing authentication.');
      } else if (code === 'auth/popup-blocked') {
        setAuthError(
          'Browser blocked the sign-in popup. Allow popups for this site and retry.',
        );
      } else if (code === 'auth/unauthorized-domain') {
        const currentHost =
          typeof window !== 'undefined' ? window.location.hostname : 'this domain';
        setAuthError(
          `Domain "${currentHost}" is not authorized in Firebase project "${activeFirebaseProjectId}". Authorize "${currentHost}" under Authentication → Settings → Authorized domains in project "${activeFirebaseProjectId}", or configure VITE_FIREBASE_* environment variables for your target Firebase project and redeploy.`,
        );
      } else {
        setAuthError(
          err instanceof Error ? err.message : 'Authentication failed.',
        );
      }
      throw err;
    }
  }, []);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      setAuthError(null);
      try {
        const res = await apiRequest<{ token: string; profile: UserProfile }>(
          '/api/auth/login',
          {
            method: 'POST',
            body: { email, password },
            requiresAuth: false,
          },
        );
        inMemoryLocalToken = res.token;
        setProfile(res.profile);
        if (res.profile?.preferences?.theme) {
          try {
            if (window.localStorage.getItem(THEME_OVERRIDE_KEY)) {
              setLocalThemeMode(res.profile.preferences.theme);
            }
          } catch {
            // Keep default dark primary aesthetic
          }
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Email sign-in failed.';
        setAuthError(msg);
        throw err;
      }
    },
    [],
  );

  const registerWithEmail = useCallback(
    async (payload: {
      email: string;
      password: string;
      fullName?: string;
      phone?: string;
      role?: UserRole;
      hospitalName?: string;
    }) => {
      setAuthError(null);
      try {
        const res = await apiRequest<{ token: string; profile: UserProfile }>(
          '/api/auth/register',
          {
            method: 'POST',
            body: payload,
            requiresAuth: false,
          },
        );
        inMemoryLocalToken = res.token;
        setProfile(res.profile);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Account registration failed.';
        setAuthError(msg);
        throw err;
      }
    },
    [],
  );

  const signOutUser = useCallback(async () => {
    const uid = profile?.uid || auth.currentUser?.uid;
    try {
      if (inMemoryLocalToken || auth.currentUser) {
        await apiRequest('/api/auth/logout', { method: 'POST' });
      }
    } catch {
      // Best-effort logout audit log
    }
    if (uid) clearQueueForUser(uid);
    inMemoryLocalToken = null;
    if (auth.currentUser) {
      await signOut(auth);
    }
    setProfile(null);
    setAuthError(null);
  }, [profile?.uid]);

  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser && !inMemoryLocalToken) return;
    const res = await apiRequest<{ profile: UserProfile }>('/api/profile', {
      method: 'GET',
    });
    setProfile(res.profile);
  }, []);

  const updateProfile = useCallback(
    async (patch: {
      fullName?: string | null;
      phone?: string | null;
      dateOfBirth?: string | null;
      preferences?: UserPreferences;
    }) => {
      const res = await apiRequest<{ profile: UserProfile }>('/api/profile', {
        method: 'PUT',
        body: patch,
      });
      setProfile(res.profile);
      return res.profile;
    },
    [],
  );

  const setThemeMode = useCallback(
    async (mode: UserPreferences['theme']) => {
      setLocalThemeMode(mode);
      try {
        window.localStorage.setItem(THEME_OVERRIDE_KEY, mode);
      } catch {
        // Ignore storage error
      }
      if (profile) {
        try {
          await updateProfile({
            preferences: {
              ...profile.preferences,
              theme: mode,
            },
          });
        } catch (err) {
          console.warn('Theme preference applied locally; server sync deferred:', err);
        }
      }
    },
    [profile, updateProfile],
  );

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        isAuthenticated,
        loading,
        authError,
        theme: resolvedTheme,
        setThemeMode,
        signInWithGoogle,
        signInWithEmail,
        registerWithEmail,
        signOutUser,
        refreshProfile,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
