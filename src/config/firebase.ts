import { initializeApp, type FirebaseOptions } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseApiKey = import.meta.env.VITE_FIREBASE_API_KEY ?? ''

export const firebaseConfig: FirebaseOptions = {
  apiKey: firebaseApiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'ptprojectsweb.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'ptprojectsweb',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'ptprojectsweb.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '93484780890',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:93484780890:web:226397c4fd1568579ff763',
}

export const isFirebaseConfigured = Boolean(firebaseApiKey.trim())

export const firebaseApp = isFirebaseConfigured ? initializeApp(firebaseConfig) : null
export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null
