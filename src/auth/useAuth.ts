import type { User } from 'firebase/auth'
import { createContext, useContext } from 'react'

export interface AuthContextValue {
  user: User | null
  loading: boolean
  tokenRefreshTime: Date | null
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  getIdToken: () => Promise<string | null>
  refreshToken: () => Promise<string | null>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>.')
  }
  return ctx
}
