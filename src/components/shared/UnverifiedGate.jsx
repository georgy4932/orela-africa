// src/components/shared/UnverifiedGate.jsx
// Shown on restricted pages when facility is not yet verified

import { appUrl } from '../../lib/appUrl'

export default function UnverifiedGate({ page, reason }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      padding: '48px 24px',
      textAlign: 'center',
    }}>
      {/* Icon */}
      <div style={{
        width: 56, height: 56,
        borderRadius: 'var(--r-lg)',
        background: 'var(--warning-dim)',
        border: '1px solid var(--warning-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 20,
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2">
          <rect x="3" y="11" width="18" height="11" rx="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>

      {/* Title */}
      <div style={{
        fontSize: 18, fontWeight: 700,
        color: 'var(--text-primary)',
        letterSpacing: '-0.02em',
        marginBottom: 8,
      }}>
        {page} is locked
      </div>

      {/* Subtitle */}
      <div style={{
        fontSize: 13, color: 'var(--text-muted)',
        maxWidth: 420, lineHeight: 1.65,
        marginBottom: 28,
      }}>
        {reason}
      </div>

      {/* Status card */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--warning-border)',
        borderRadius: 'var(--r-lg)',
        padding: '20px 28px',
        maxWidth: 460,
        width: '100%',
        marginBottom: 24,
        textAlign: 'left',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: 12,
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: 'var(--warning)',
          }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--warning)' }}>
            Verification pending
          </span>
        </div>

        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: 14 }}>
          Your facility registration is under review. Once verified, you will have full access to the medicine availability network including {page.toLowerCase()}.
        </div>

        <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
            To expedite verification:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 1 }}>1.</span>
              Email <a href="mailto:hello@medichain.africa" style={{ color: 'var(--primary)', margin: '0 4px' }}>hello@medichain.africa</a> with your facility name and PCN/NAFDAC registration number
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 1 }}>2.</span>
              Make sure your registration number is added in <a href={appUrl('/settings')} style={{ color: 'var(--primary)' }}>Settings → Network Identity</a>
            </div>
          </div>
        </div>
      </div>

      {/* What you can do while waiting */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
        padding: '16px 24px',
        maxWidth: 460,
        width: '100%',
        textAlign: 'left',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 10 }}>
          While you wait, you can:
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { label: 'Add your inventory', desc: 'Stock you add now will be published to the network immediately after verification', href: appUrl('/inventory') },
            { label: 'Complete your profile', desc: 'Ensure your registration number and facility details are accurate', href: appUrl('/settings') },
            { label: 'Add your team', desc: 'Invite staff members so they are ready when the network activates', href: appUrl('/staff') },
          ].map(item => (
            <a key={item.href} href={item.href} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '8px 10px', borderRadius: 'var(--r)',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-soft)',
              textDecoration: 'none',
              transition: 'border-color 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-soft)'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{item.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{item.desc}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
