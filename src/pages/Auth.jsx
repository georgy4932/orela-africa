import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { InlineError } from '../components/shared'

const RESET_REDIRECT = 'https://app.orela.africa/reset-password'

export default function AuthPage() {
  const [mode,     setMode]     = useState('signin')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [success,  setSuccess]  = useState(null)
  const { signIn, signUp }      = useAuth()

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null); setSuccess(null); setLoading(true)

    if (mode === 'forgot') {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: RESET_REDIRECT,
      })
      setLoading(false)
      if (err) setError(err.message)
      else setSuccess('If an account exists for that email, a reset link has been sent. Check your inbox.')
      return
    }

    if (mode === 'signin') {
      const err = await signIn(email, password)
      if (err) setError(err.message)
    } else {
      if (!fullName.trim()) { setError('Full name is required.'); setLoading(false); return }
      const { data, error: err } = await signUp(email, password, fullName)
      if (err) {
        setError(err.message)
      } else if (data?.user?.identities?.length === 0) {
        // Supabase returns a user with empty identities when the email already exists
        // and email confirmation is enabled (prevents email enumeration but we surface it)
        setError('__duplicate__')
      } else {
        setSuccess('Account created! Check your email and click the confirmation link to activate your account.')
      }
    }
    setLoading(false)
  }

  function switchMode(m) {
    setMode(m); setError(null); setSuccess(null); setPassword('')
  }

  const isForgot = mode === 'forgot'

  return (
    <div className="auth-layout">
      <div className="auth-card">

        {/* Brand */}
        <div className="auth-brand">
          <div className="auth-brand-icon-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="#07111f" strokeWidth="2.5" style={{width:22,height:22}}>
              <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><path d="M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>
            </svg>
          </div>
          <span className="auth-brand-name">Orela</span>
          <span className="auth-brand-tag">Africa Pharmacy Supply Intelligence</span>
        </div>

        {/* Card */}
        <div className="auth-surface">
          <div className="auth-title">
            {isForgot ? 'Reset your password' : mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </div>
          <div className="auth-subtitle">
            {isForgot
              ? 'Enter your email and we\'ll send you a reset link.'
              : mode === 'signin'
                ? 'Sign in to access your facility command centre.'
                : 'Set up your facility and start tracking medicine availability.'}
          </div>

          {error === '__duplicate__' ? (
            <div className="inline-alert alert-warning" style={{ marginBottom: 4, flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <span className="inline-alert-icon">!</span>
                <span>An account with this email already exists.</span>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ alignSelf: 'flex-start' }}
                onClick={() => { setError(null); setSuccess(null); switchMode('signin') }}
              >
                Sign in instead →
              </button>
            </div>
          ) : error ? (
            <InlineError message={error} />
          ) : null}
          {success && (
            <div className="inline-alert alert-success" style={{ marginBottom: 4 }}>
              <span className="inline-alert-icon">✓</span>
              <span>{success}</span>
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <div className="field">
                <label>Full name</label>
                <input type="text" placeholder="Dr. Amaka Obi" value={fullName}
                  onChange={e => setFullName(e.target.value)} required autoComplete="name" />
              </div>
            )}

            <div className="field">
              <label>Email address</label>
              <input type="email" placeholder="you@facility.com" value={email}
                onChange={e => setEmail(e.target.value)} required autoComplete="email" />
            </div>

            {!isForgot && (
              <div className="field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                  <label style={{ margin: 0 }}>Password</label>
                  {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      style={{ fontSize: 11, color: 'var(--primary)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'none' }}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <input type="password" placeholder="••••••••" value={password}
                  onChange={e => setPassword(e.target.value)} required minLength={8}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-full btn-lg"
              disabled={loading} style={{ marginTop: 2 }}>
              {loading
                ? <><div className="spinner spinner-sm" style={{borderTopColor:'#07111f'}}/>{' '}
                    {isForgot ? 'Sending…' : mode === 'signin' ? 'Signing in…' : 'Creating account…'}</>
                : isForgot ? 'Send reset link'
                  : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="auth-switch">
            {isForgot
              ? <><button onClick={() => switchMode('signin')}>← Back to sign in</button></>
              : mode === 'signin'
                ? <>No account?{' '}<button onClick={() => switchMode('signup')}>Sign up</button></>
                : <>Have an account?{' '}<button onClick={() => switchMode('signin')}>Sign in</button></>
            }
          </div>
        </div>
      </div>
    </div>
  )
}
