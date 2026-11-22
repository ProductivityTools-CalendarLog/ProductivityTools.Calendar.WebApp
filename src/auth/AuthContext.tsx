import {
  GoogleAuthProvider,
  onIdTokenChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { firebaseAuth } from '../config/firebase'
import { statusService } from '../services/statusService'
import { AuthContext, type AuthContextValue } from './useAuth'

const TOKEN_REFRESH_TIME_KEY = 'pt_calendar_token_refresh_time'

function readStoredRefreshTime(): Date | null {
  try {
    const raw = localStorage.getItem(TOKEN_REFRESH_TIME_KEY)
    if (!raw) return null
    const parsed = new Date(raw)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  } catch {
    return null
  }
}

function saveRefreshTime(date: Date | null): void {
  try {
    if (date) {
      localStorage.setItem(TOKEN_REFRESH_TIME_KEY, date.toISOString())
    } else {
      localStorage.removeItem(TOKEN_REFRESH_TIME_KEY)
    }
  } catch {
    // Ignore storage errors
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [tokenRefreshTime, setTokenRefreshTime] = useState<Date | null>(readStoredRefreshTime)

  const refreshToken = useCallback(async (): Promise<string | null> => {
    const current = firebaseAuth.currentUser
    if (!current) return null
    const token = await current.getIdToken(true)
    const now = new Date()
    saveRefreshTime(now)
    setTokenRefreshTime(now)
    return token
  }, [])

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(firebaseAuth, async (nextUser) => {
      setUser(nextUser)
      setLoading(false)

      if (!nextUser) {
        saveRefreshTime(null)
        setTokenRefreshTime(null)
        return
      }

      try {
        const result = await nextUser.getIdTokenResult()
        const issuedAtClaim = result.claims.iat
        const issuedAt =
          typeof issuedAtClaim === 'number'
            ? new Date(issuedAtClaim * 1000)
            : result.issuedAtTime
              ? new Date(result.issuedAtTime)
              : new Date()
        saveRefreshTime(issuedAt)
        setTokenRefreshTime(issuedAt)
      } catch {
        const now = new Date()
        saveRefreshTime(now)
        setTokenRefreshTime(now)
      }
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    const checkAndRefreshIfNeeded = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return
      const current = firebaseAuth.currentUser
      if (!current) return

      try {
        const result = await current.getIdTokenResult()
        const expMs = result.expirationTime ? new Date(result.expirationTime).getTime() : 0
        if (expMs && expMs - Date.now() < 15 * 60 * 1000) {
          statusService.info('Auto-refreshing session token...')
          await refreshToken()
          statusService.success('Session token refreshed')
        }
      } catch {
        // Ignore transient offline token inspection failures
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkAndRefreshIfNeeded()
      }
    }

    const handleFocus = () => {
      void checkAndRefreshIfNeeded()
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    const intervalId = window.setInterval(() => {
      void checkAndRefreshIfNeeded()
    }, 5 * 60 * 1000)

    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.clearInterval(intervalId)
    }
  }, [refreshToken])

  const signInWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    await signInWithPopup(firebaseAuth, provider)
  }, [])

  const signOut = useCallback(async () => {
    saveRefreshTime(null)
    setTokenRefreshTime(null)
    await firebaseSignOut(firebaseAuth)
  }, [])

  const getIdToken = useCallback(async () => {
    const current = firebaseAuth.currentUser
    return current ? current.getIdToken() : null
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      tokenRefreshTime,
      signInWithGoogle,
      signOut,
      getIdToken,
      refreshToken,
    }),
    [user, loading, tokenRefreshTime, signInWithGoogle, signOut, getIdToken, refreshToken],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
