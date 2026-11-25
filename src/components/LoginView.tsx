import { useState } from 'react'
import { useAuth } from '../auth/useAuth'

export function LoginView() {
  const { signInWithGoogle } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async () => {
    setBusy(true)
    setError(null)
    try {
      await signInWithGoogle()
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setError((err as Error)?.message || 'Logowanie przez Google nie powiodło się.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-screen">
      <section className="login-card" aria-labelledby="login-heading">
        <div className="brand">
          <img
            src="/pt-calendar-icon.png"
            alt=""
            aria-hidden="true"
            className="brand-icon"
          />
          <span className="brand-title">PT Calendar</span>
        </div>

        <div>
          <h1 id="login-heading" className="login-title">
            Zaloguj się do panelu
          </h1>
          <p className="login-desc" style={{ marginTop: '0.45rem' }}>
            Użyj autoryzowanego konta Google (Firebase <code>ptprojectsweb</code>), aby zarządzać
            listą synchronizowanych kalendarzy.
          </p>
        </div>

        {error && (
          <div className="alert alert-error" role="alert">
            <span>{error}</span>
          </div>
        )}

        <button
          id="google-sign-in-button"
          type="button"
          className="btn btn-primary"
          onClick={handleLogin}
          disabled={busy}
        >
          {busy ? 'Logowanie…' : 'Zaloguj przez Google'}
        </button>
      </section>
    </main>
  )
}
