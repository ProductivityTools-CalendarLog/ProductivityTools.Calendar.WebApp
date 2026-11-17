import { initializeApp, type FirebaseOptions } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseApiKey = (import.meta.env.VITE_FIREBASE_API_KEY ?? '').trim()

export const firebaseConfig: FirebaseOptions = {
  apiKey: firebaseApiKey,
  authDomain: 'ptprojectsweb.firebaseapp.com',
  projectId: 'ptprojectsweb',
  storageBucket: 'ptprojectsweb.firebasestorage.app',
  messagingSenderId: '93484780890',
  appId: '1:93484780890:web:684adab540883aef9ff763',
}

export const firebaseApp = firebaseApiKey ? initializeApp(firebaseConfig) : null
export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null
