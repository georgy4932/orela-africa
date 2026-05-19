import { useState, useEffect } from 'react'

const VISIT_KEY  = 'orela_visit_count'
const DISMISS_KEY = 'orela_install_dismissed'
const INSTALLED_KEY = 'orela_install_accepted'

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Don't show if already dismissed or installed
    if (localStorage.getItem(DISMISS_KEY) || localStorage.getItem(INSTALLED_KEY)) return
    // Don't show if already running as installed PWA
    if (window.matchMedia('(display-mode: standalone)').matches) return

    // Increment visit counter
    const visits = parseInt(localStorage.getItem(VISIT_KEY) || '0', 10) + 1
    localStorage.setItem(VISIT_KEY, visits)

    // Capture the browser install prompt event
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      if (visits >= 3) setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function handleInstall() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') localStorage.setItem(INSTALLED_KEY, '1')
    setDeferredPrompt(null)
    setShow(false)
  }

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setShow(false)
  }

  if (!show) return null

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, width: 'calc(100% - 32px)', maxWidth: 420,
      background: 'var(--bg-elevated)',
      border: '1px solid var(--primary-border)',
      borderRadius: 'var(--r-xl)',
      padding: '16px 20px',
      boxShadow: '0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(25,194,181,0.1)',
      display: 'flex', alignItems: 'center', gap: 14,
      animation: 'slideUp 0.2s ease',
    }}>
      {/* Icon */}
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        background: 'linear-gradient(135deg, #19c2b5, #2563eb)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="3.5" fill="#04080f"/>
          {[0,45,90,135,180,225,270,315].map(deg => {
            const r = deg * Math.PI / 180
            return (
              <line key={deg}
                x1={16 + Math.cos(r)*7} y1={16 + Math.sin(r)*7}
                x2={16 + Math.cos(r)*11} y2={16 + Math.sin(r)*11}
                stroke="#04080f" strokeWidth="2.2" strokeLinecap="round"
              />
            )
          })}
        </svg>
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
          Add Orela to home screen
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.4 }}>
          Faster access, works offline
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          onClick={handleDismiss}
          style={{
            padding: '6px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
          }}
        >
          Not now
        </button>
        <button
          onClick={handleInstall}
          className="btn btn-primary btn-sm"
          style={{ fontSize: 12 }}
        >
          Install
        </button>
      </div>
    </div>
  )
}
