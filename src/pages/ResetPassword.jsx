import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { InlineError } from '../components/shared'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [ready,    setReady]    = useState(false)
  const [done,     setDone]     = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    // Supabase detects the recovery token in the URL hash and fires PASSWORD_RECOVERY.
    // We must wait for this event before showing the form — the session isn't valid until it fires.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 8)  { setError('Password must be at least 8 characters.'); return }
    setError(null); setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (err) setError(err.message)
    else setDone(true)
  }

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

        <div className="auth-surface">
          {done ? (
            <>
              <div className="auth-title">Password updated</div>
              <div className="auth-subtitle" style={{ marginBottom: 24 }}>
                Your password has been changed successfully.
              </div>
              <button
                className="btn btn-primary btn-full btn-lg"
                onClick={() => navigate('/auth')}
              >
                Sign in
              </button>
            </>
          ) : !ready ? (
            <>
              <div className="auth-title">Checking reset link</div>
              <div className="auth-subtitle">
                Validating your reset link — this should only take a moment.
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}>
                <div className="spinner spinner-lg" />
              </div>
              <div className="auth-switch" style={{ marginTop: 28 }}>
                <button onClick={() => navigate('/auth')}>← Back to sign in</button>
              </div>
            </>
          ) : (
            <>
              <div className="auth-title">Set a new password</div>
              <div className="auth-subtitle">
                Choose a strong password for your Orela account.
              </div>

              {error && <InlineError message={error} />}

              <form className="auth-form" onSubmit={handleSubmit}>
                <div className="field">
                  <label>New password</label>
                  <input
                    type="password" placeholder="••••••••" value={password}
                    onChange={e => setPassword(e.target.value)}
                    required minLength={8} autoComplete="new-password"
                    autoFocus
                  />
                </div>
                <div className="field">
                  <label>Confirm new password</label>
                  <input
                    type="password" placeholder="••••••••" value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required minLength={8} autoComplete="new-password"
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-full btn-lg"
                  disabled={loading} style={{ marginTop: 2 }}>
                  {loading
                    ? <><div className="spinner spinner-sm" style={{borderTopColor:'#07111f'}}/> Updating…</>
                    : 'Update password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
