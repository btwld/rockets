import { initializeApp } from 'firebase/app';
import {
  getAuth,
  getIdTokenResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';

function requireEnv(name: keyof ImportMetaEnv): string {
  const value = import.meta.env[name];
  if (!value) {
    throw new Error(`Missing ${name} in apps/web/.env`);
  }
  return value;
}

const app = initializeApp({
  apiKey: requireEnv('VITE_FIREBASE_API_KEY'),
  authDomain: requireEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: requireEnv('VITE_FIREBASE_PROJECT_ID'),
  appId: requireEnv('VITE_FIREBASE_APP_ID'),
});

export const auth = getAuth(app);

/** OAuth code saved when GitHub returns before Firebase session is restored. */
export const GITHUB_OAUTH_CODE_STORAGE_KEY = 'sample-code-review.github-oauth-code';

export function watchAuth(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export async function login(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logout(): Promise<void> {
  await signOut(auth);
}

/** Wait for persisted Firebase session after a full-page redirect (e.g. GitHub OAuth). */
export async function waitForAuthReady(): Promise<User | null> {
  await auth.authStateReady();
  return auth.currentUser;
}

export async function getIdToken(): Promise<string> {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not signed in');
  }
  return user.getIdToken();
}

export async function getIdTokenExpirationTime(): Promise<string> {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not signed in');
  }
  const token = await getIdTokenResult(user);
  return token.expirationTime;
}
