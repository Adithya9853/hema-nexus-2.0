import { initializeApp, getApps, type FirebaseOptions } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

function readEnv(key: string): string {
  const value = import.meta.env[key];
  return typeof value === 'string' ? value.trim() : '';
}

function resolveFirebaseConfig(): FirebaseOptions {
  const envApiKey = readEnv('VITE_FIREBASE_API_KEY');
  const envAuthDomain = readEnv('VITE_FIREBASE_AUTH_DOMAIN');
  const envProjectId = readEnv('VITE_FIREBASE_PROJECT_ID');
  const envAppId = readEnv('VITE_FIREBASE_APP_ID');
  const envStorageBucket = readEnv('VITE_FIREBASE_STORAGE_BUCKET');
  const envMessagingSenderId = readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID');

  const hasAnyEnvOverride = Boolean(
    envApiKey || envAuthDomain || envProjectId || envAppId,
  );

  if (hasAnyEnvOverride) {
    const hasCompleteCoreEnv = Boolean(
      envApiKey && envAuthDomain && envProjectId && envAppId,
    );

    if (hasCompleteCoreEnv) {
      return {
        apiKey: envApiKey,
        authDomain: envAuthDomain,
        projectId: envProjectId,
        appId: envAppId,
        ...(envStorageBucket ? { storageBucket: envStorageBucket } : {}),
        ...(envMessagingSenderId
          ? { messagingSenderId: envMessagingSenderId }
          : {}),
      };
    }

    console.error(
      'Incomplete VITE_FIREBASE_* environment override detected. Set VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, and VITE_FIREBASE_APP_ID together so Firebase projects are not mixed.',
    );
  }

  return firebaseConfig;
}

const resolvedConfig = resolveFirebaseConfig();

export const activeFirebaseProjectId = resolvedConfig.projectId || '';
export const activeFirebaseAuthDomain = resolvedConfig.authDomain || '';

const app = getApps().length ? getApps()[0] : initializeApp(resolvedConfig);

export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({
  prompt: 'select_account',
});
