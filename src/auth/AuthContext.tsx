import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { firebaseAuth } from '../config/firebase'
import { AuthContext, type AuthContextValue } from './useAuth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (nextUser) => {
      setUser(nextUser)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  const signInWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    await signInWithPopup(firebaseAuth, provider)
  }, [])

  const signOut = useCallback(async () => {
    await firebaseSignOut(firebaseAuth)
  }, [])

  const getIdToken = useCallback(async () => {
    const current = firebaseAuth.currentUser
    return current ? current.getIdToken() : null
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, signInWithGoogle, signOut, getIdToken }),
    [user, loading, signInWithGoogle, signOut, getIdToken],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
