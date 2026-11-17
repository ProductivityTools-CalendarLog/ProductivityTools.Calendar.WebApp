import { initializeApp, type FirebaseOptions } from 'firebase/app'
import { getAuth } from 'firebase/auth'

export const firebaseConfig: FirebaseOptions = {
  apiKey: 'AIzaSyAxmnZm4597RcMVQeJrby3HpuDfzYyTJoU',
  authDomain: 'ptprojectsweb.firebaseapp.com',
  projectId: 'ptprojectsweb',
  storageBucket: 'ptprojectsweb.firebasestorage.app',
  messagingSenderId: '93484780890',
  appId: '1:93484780890:web:684adab540883aef9ff763',
}

export const firebaseApp = initializeApp(firebaseConfig)
export const firebaseAuth = getAuth(firebaseApp)
