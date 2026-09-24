import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const hasFirebaseConfig = Boolean(config.apiKey && config.projectId && config.appId);

export function initFirebase() {
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  // Anonymous auth: no login screen, but lets security rules require a signed-in client.
  const ready = signInAnonymously(auth);
  return { db, ready };
}
