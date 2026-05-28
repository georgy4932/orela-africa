// src/pages/Landing.jsx
// Static marketing landing page — no auth required

export default function LandingPage() {
  return (
    <>
      <style>{`
        .lp-root *, .lp-root *::before, .lp-root *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .lp-root {
          font-family: 'DM Sans', -apple-system, sans-serif;
          background: #050f1a;
          color: #f0f6ff;
          line-height: 1.6;
          overflow-x: hidden;
          min-height: 100vh;
        }
        .lp-root::before {
          content: '';
          position: fixed; inset: 0;
          background-image: linear-gradient(rgba(25,194,181,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(25,194,181,0.025) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none;
          z-index: 0;
        }

        /* NAV */
        .lp-nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; display: flex; align-items: center; justify-content: space-between; padding: 0 48px; height: 56px; background: rgba(5,15,26,0.92); backdrop-filter: blur(20px); border-bottom: 1px solid #1a3050; }
        .lp-nav-left { display: flex; align-items: center; gap: 36px; }
        .lp-nav-brand { display: flex; align-items: center; gap: 9px; text-decoration: none; }
        .lp-nav-logo { width: 26px; height: 26px; background: #19c2b5; border-radius: 5px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .lp-nav-logo svg { width: 12px; height: 12px; color: #050f1a; }
        .lp-nav-name { font-size: 14px; font-weight: 600; color: #f0f6ff; letter-spacing: -0.02em; }
        .lp-nav-links { display: flex; gap: 28px; list-style: none; }
        .lp-nav-links a { font-size: 13px; color: #8bb4d4; text-decoration: none; transition: color 0.15s; }
        .lp-nav-links a:hover { color: #f0f6ff; }
        .lp-nav-right { display: flex; align-items: center; gap: 12px; }
        .lp-nav-signin { font-size: 13px; color: #8bb4d4; text-decoration: none; transition: color 0.15s; }
        .lp-nav-signin:hover { color: #f0f6ff; }
        .lp-nav-cta { display: inline-flex; align-items: center; gap: 6px; padding: 7px 16px; background: #19c2b5; color: #050f1a; font-size: 13px; font-weight: 600; border-radius: 5px; text-decoration: none; transition: background 0.15s; }
        .lp-nav-cta:hover { background: #12a79c; }

        /* HERO */
        .lp-hero { min-height: 100vh; display: grid; grid-template-columns: 1fr 1fr; align-items: center; gap: 60px; padding: 100px 80px 80px; position: relative; z-index: 1; }
        .lp-hero-eyebrow { display: inline-flex; align-items: center; gap: 7px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #19c2b5; margin-bottom: 24px; }
        .lp-eyebrow-dot { width: 5px; height: 5px; border-radius: 50%; background: #19c2b5; animation: lp-pulse 2s infinite; }
        @keyframes lp-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        .lp-hero-headline { font-size: clamp(30px,4vw,50px); font-weight: 700; line-height: 1.1; letter-spacing: -0.03em; color: #f0f6ff; margin-bottom: 20px; }
        .lp-hero-headline em { font-style: normal; color: #19c2b5; }
        .lp-hero-sub { font-size: 15px; color: #8bb4d4; max-width: 460px; line-height: 1.7; margin-bottom: 36px; font-weight: 300; }
        .lp-hero-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 28px; }
        .lp-hero-meta { font-size: 11.5px; color: #4a6d8c; display: flex; align-items: center; gap: 6px; }
        .lp-btn-primary { display: inline-flex; align-items: center; gap: 7px; padding: 11px 22px; background: #19c2b5; color: #050f1a; font-size: 14px; font-weight: 600; border-radius: 6px; text-decoration: none; transition: background 0.15s, transform 0.15s; border: none; cursor: pointer; }
        .lp-btn-primary:hover { background: #12a79c; transform: translateY(-1px); }
        .lp-btn-secondary { display: inline-flex; align-items: center; gap: 7px; padding: 11px 22px; background: transparent; color: #8bb4d4; font-size: 14px; font-weight: 500; border-radius: 6px; text-decoration: none; border: 1px solid #223a58; transition: color 0.15s, border-color 0.15s; }
        .lp-btn-secondary:hover { color: #f0f6ff; border-color: #4a6d8c; }

        /* NETWORK PANEL */
        .lp-panel { background: #0a1828; border: 1px solid #1a3050; border-radius: 12px; overflow: hidden; box-shadow: 0 32px 64px rgba(0,0,0,0.5); }
        .lp-panel-header { display: flex; align-items: center; justify-content: space-between; padding: 11px 16px; background: #0e2038; border-bottom: 1px solid #1a3050; }
        .lp-panel-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #8bb4d4; }
        .lp-panel-online { display: flex; align-items: center; gap: 5px; font-family: 'JetBrains Mono', monospace; font-size: 9px; color: #22c55e; }
        .lp-online-dot { width: 5px; height: 5px; border-radius: 50%; background: #22c55e; animation: lp-pulse 2s infinite; }
        .lp-panel-body { padding: 14px; }
        .lp-topo-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #4a6d8c; margin-bottom: 8px; }
        .lp-topo-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 5px; margin-bottom: 12px; }
        .lp-topo-node { background: #0e2038; border: 1px solid #1a3050; border-radius: 6px; padding: 9px 6px; display: flex; flex-direction: column; align-items: center; gap: 4px; position: relative; }
        .lp-topo-icon { width: 26px; height: 26px; border-radius: 4px; display: flex; align-items: center; justify-content: center; }
        .lp-topo-icon svg { width: 13px; height: 13px; }
        .lp-topo-txt { font-size: 8px; color: #4a6d8c; text-transform: uppercase; letter-spacing: 0.05em; text-align: center; line-height: 1.2; }
        .lp-topo-status { width: 5px; height: 5px; border-radius: 50%; position: absolute; top: 5px; right: 5px; }
        .lp-divider { height: 1px; background: #1a3050; margin: 10px 0; }
        .lp-summary-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 5px; margin-bottom: 12px; }
        .lp-sum-item { background: #0e2038; border: 1px solid #1a3050; border-radius: 5px; padding: 9px; }
        .lp-sum-num { font-family: 'JetBrains Mono', monospace; font-size: 16px; font-weight: 500; line-height: 1; margin-bottom: 2px; }
        .lp-sum-label { font-size: 8px; color: #4a6d8c; text-transform: uppercase; letter-spacing: 0.08em; line-height: 1.3; }
        .lp-fac-sec-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #4a6d8c; margin-bottom: 6px; }
        .lp-fac-row { display: flex; align-items: center; gap: 7px; padding: 5px 0; border-bottom: 1px solid rgba(26,48,80,0.5); font-size: 10px; }
        .lp-fac-row:last-child { border-bottom: none; }
        .lp-fac-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }
        .lp-fac-name { color: #8bb4d4; flex: 1; }
        .lp-fac-chip { font-family: 'JetBrains Mono', monospace; font-size: 9px; padding: 2px 5px; border-radius: 3px; }

        /* STAT BAR */
        .lp-stat-bar { display: flex; position: relative; z-index: 1; border-top: 1px solid #1a3050; border-bottom: 1px solid #1a3050; background: #050f1a; }
        .lp-stat-item { flex: 1; padding: 20px 32px; border-right: 1px solid #1a3050; }
        .lp-stat-item:last-child { border-right: none; }
        .lp-stat-num { font-family: 'JetBrains Mono', monospace; font-size: 20px; font-weight: 500; color: #19c2b5; letter-spacing: -0.02em; display: block; margin-bottom: 3px; }
        .lp-stat-label { font-size: 10px; color: #4a6d8c; text-transform: uppercase; letter-spacing: 0.1em; }

        /* LAYOUT */
        .lp-section { position: relative; z-index: 1; background: #050f1a; }
        .lp-container { max-width: 1100px; margin: 0 auto; padding: 0 48px; }
        .lp-section-pad { padding: 96px 0; }
        .lp-section-label { display: flex; align-items: center; gap: 10px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; color: #19c2b5; margin-bottom: 24px; }
        .lp-section-label::after { content: ''; flex: 1; height: 1px; background: #1a3050; }

        /* PROBLEM */
        .lp-problem-headline { font-size: clamp(26px,4vw,42px); font-weight: 700; line-height: 1.15; letter-spacing: -0.025em; max-width: 640px; margin-bottom: 40px; color: #f0f6ff; }
        .lp-problem-headline em { font-style: normal; color: #8bb4d4; }
        .lp-problem-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 1px; background: #1a3050; border-radius: 10px; overflow: hidden; }
        .lp-problem-card { background: #0a1828; padding: 26px 22px; display: flex; flex-direction: column; gap: 10px; transition: background 0.15s; }
        .lp-problem-card:hover { background: #0e2038; }
        .lp-p-icon { width: 34px; height: 34px; border-radius: 6px; background: #0e2038; border: 1px solid #223a58; display: flex; align-items: center; justify-content: center; }
        .lp-p-icon svg { width: 15px; height: 15px; color: #8bb4d4; }
        .lp-p-title { font-size: 14px; font-weight: 600; color: #f0f6ff; letter-spacing: -0.01em; }
        .lp-p-desc { font-size: 12.5px; color: #8bb4d4; line-height: 1.65; }

        /* HOW */
        .lp-how-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: start; }
        .lp-how-headline { font-size: clamp(22px,3vw,34px); font-weight: 700; letter-spacing: -0.025em; line-height: 1.2; margin-bottom: 32px; color: #f0f6ff; }
        .lp-steps { display: flex; flex-direction: column; }
        .lp-step { display: flex; gap: 16px; padding: 22px 0; border-bottom: 1px solid #1a3050; }
        .lp-step:last-child { border-bottom: none; }
        .lp-step-num { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #19c2b5; font-weight: 500; flex-shrink: 0; padding-top: 2px; width: 24px; }
        .lp-step-title { font-size: 14px; font-weight: 600; color: #f0f6ff; margin-bottom: 5px; letter-spacing: -0.01em; }
        .lp-step-desc { font-size: 12.5px; color: #8bb4d4; line-height: 1.65; }

        /* CMD PREVIEW */
        .lp-cmd { background: #0a1828; border: 1px solid #1a3050; border-radius: 10px; overflow: hidden; box-shadow: 0 20px 48px rgba(0,0,0,0.4); }
        .lp-cmd-bar { padding: 10px 14px; background: #0e2038; border-bottom: 1px solid #1a3050; display: flex; align-items: center; gap: 6px; }
        .lp-cmd-dot { width: 7px; height: 7px; border-radius: 50%; }
        .lp-cmd-url { font-family: 'JetBrains Mono', monospace; font-size: 9px; color: #4a6d8c; margin-left: 6px; }
        .lp-cmd-body { padding: 14px; }
        .lp-cmd-eyebrow { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #4a6d8c; margin-bottom: 3px; }
        .lp-cmd-title { font-size: 14px; font-weight: 700; color: #f0f6ff; letter-spacing: -0.02em; margin-bottom: 12px; }
        .lp-cmd-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .lp-cmd-col-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #4a6d8c; margin-bottom: 6px; }
        .lp-cmd-fac-list { display: flex; flex-direction: column; gap: 4px; }
        .lp-cmd-fac-item { display: flex; align-items: center; gap: 6px; padding: 5px 8px; background: #0e2038; border: 1px solid #1a3050; border-radius: 4px; }
        .lp-cmd-fac-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }
        .lp-cmd-fac-name { font-size: 10px; color: #8bb4d4; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .lp-cmd-fac-val { font-family: 'JetBrains Mono', monospace; font-size: 9px; color: #8bb4d4; flex-shrink: 0; }
        .lp-cmd-metrics { display: flex; flex-direction: column; gap: 4px; }
        .lp-cmd-metric { background: #0e2038; border: 1px solid #1a3050; border-radius: 4px; padding: 8px; }
        .lp-cmd-metric-num { font-family: 'JetBrains Mono', monospace; font-size: 18px; font-weight: 500; line-height: 1; margin-bottom: 2px; }
        .lp-cmd-metric-label { font-size: 8px; color: #4a6d8c; text-transform: uppercase; letter-spacing: 0.08em; }

        /* WHO */
        .lp-who-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 1px; background: #1a3050; border-radius: 10px; overflow: hidden; margin-top: 40px; }
        .lp-who-card { background: #0a1828; padding: 22px 20px; display: flex; flex-direction: column; gap: 9px; transition: background 0.15s; }
        .lp-who-card:hover { background: #0e2038; }
        .lp-who-icon { width: 32px; height: 32px; border-radius: 5px; background: #0e2038; border: 1px solid #223a58; display: flex; align-items: center; justify-content: center; }
        .lp-who-icon svg { width: 14px; height: 14px; color: #8bb4d4; }
        .lp-who-title { font-size: 13px; font-weight: 600; color: #f0f6ff; letter-spacing: -0.01em; }
        .lp-who-desc { font-size: 12px; color: #8bb4d4; line-height: 1.6; }

        /* FEATURES */
        .lp-features-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 1px; background: #1a3050; border-radius: 10px; overflow: hidden; margin-top: 40px; }
        .lp-feature-card { background: #0a1828; padding: 30px 26px; display: flex; flex-direction: column; gap: 10px; transition: background 0.15s; }
        .lp-feature-card:hover { background: #0e2038; }
        .lp-feature-tag { display: inline-flex; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #19c2b5; background: rgba(25,194,181,0.08); border: 1px solid rgba(25,194,181,0.18); padding: 2px 7px; border-radius: 3px; width: fit-content; }
        .lp-feature-title { font-size: 16px; font-weight: 700; color: #f0f6ff; letter-spacing: -0.02em; line-height: 1.25; }
        .lp-feature-desc { font-size: 12.5px; color: #8bb4d4; line-height: 1.7; }
        .lp-feature-surface { font-size: 10px; color: #4a6d8c; font-family: 'JetBrains Mono', monospace; margin-top: 2px; }

        /* TRUST */
        .lp-trust { padding: 80px 0; border-top: 1px solid #1a3050; border-bottom: 1px solid #1a3050; background: #050f1a; }
        .lp-trust-inner { max-width: 640px; margin: 0 auto; text-align: center; padding: 0 48px; }
        .lp-trust-quote { font-family: 'Instrument Serif', Georgia, serif; font-size: clamp(18px,3vw,28px); line-height: 1.5; color: #f0f6ff; margin-bottom: 14px; font-style: italic; }
        .lp-trust-attr { font-size: 10px; color: #4a6d8c; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 36px; }
        .lp-trust-items { display: flex; align-items: center; justify-content: center; gap: 24px; flex-wrap: wrap; }
        .lp-trust-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #8bb4d4; }
        .lp-trust-item svg { color: #19c2b5; width: 13px; height: 13px; flex-shrink: 0; }

        /* CTA */
        .lp-cta { padding: 112px 0; text-align: center; position: relative; background: #050f1a; }
        .lp-cta::before { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 560px; height: 360px; background: radial-gradient(ellipse, rgba(25,194,181,0.06) 0%, transparent 70%); pointer-events: none; }
        .lp-cta-headline { font-size: clamp(28px,5vw,52px); font-weight: 700; line-height: 1.1; letter-spacing: -0.03em; max-width: 580px; margin: 0 auto 18px; color: #f0f6ff; }
        .lp-cta-headline em { font-style: normal; color: #19c2b5; }
        .lp-cta-sub { font-size: 15px; color: #8bb4d4; max-width: 400px; margin: 0 auto 32px; line-height: 1.65; font-weight: 300; }
        .lp-cta-note { margin-top: 12px; font-size: 11px; color: #4a6d8c; }

        /* FOOTER */
        .lp-footer { padding: 26px 48px; border-top: 1px solid #1a3050; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; position: relative; z-index: 1; background: #050f1a; }
        .lp-footer-brand { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #4a6d8c; }
        .lp-footer-links { display: flex; gap: 18px; flex-wrap: wrap; }
        .lp-footer-links a { font-size: 11.5px; color: #4a6d8c; text-decoration: none; transition: color 0.15s; }
        .lp-footer-links a:hover { color: #8bb4d4; }

        /* RESPONSIVE */
        @media (max-width: 960px) {
          .lp-nav { padding: 0 24px; }
          .lp-nav-links { display: none; }
          .lp-hero { grid-template-columns: 1fr; padding: 88px 24px 56px; gap: 36px; }
          .lp-how-grid { grid-template-columns: 1fr; gap: 36px; }
          .lp-problem-grid, .lp-who-grid { grid-template-columns: 1fr 1fr; }
          .lp-features-grid { grid-template-columns: 1fr; }
          .lp-container { padding: 0 24px; }
          .lp-footer { padding: 24px; flex-direction: column; align-items: flex-start; }
          .lp-trust-inner { padding: 0 24px; }
        }
        @media (max-width: 640px) {
          .lp-problem-grid, .lp-who-grid { grid-template-columns: 1fr; }
          .lp-stat-bar { flex-direction: column; }
          .lp-stat-item { border-right: none; border-bottom: 1px solid #1a3050; }
          .lp-stat-item:last-child { border-bottom: none; }
          .lp-topo-grid { grid-template-columns: repeat(2,1fr); }
          .lp-summary-grid { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 480px) { .lp-cmd { display: none; } }
      `}</style>

      <div className="lp-root">
        {/* NAV */}
        <nav className="lp-nav">
          <div className="lp-nav-left">
            <a href="/ng" className="lp-nav-brand">
              <div className="lp-nav-logo">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><path d="M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>
              </div>
              <span className="lp-nav-name">Orela Nigeria</span>
            </a>
            <ul className="lp-nav-links">
              <li><a href="#how">Product</a></li>
              <li><a href="#network">Facilities</a></li>
              <li><a href="/ng/docs">Docs</a></li>
              <li><a href="/ng/medicine-alerts">Drug Alerts</a></li>
            </ul>
          </div>
          <div className="lp-nav-right">
            <a href="/ng/auth" className="lp-nav-signin">Sign in</a>
            <a href="/ng/auth" className="lp-nav-cta">Join the network →</a>
          </div>
        </nav>

        {/* HERO */}
        <section className="lp-hero">
          <div>
            <div className="lp-hero-eyebrow">
              <div className="lp-eyebrow-dot"></div>
              Medicine Availability Network · Nigeria
            </div>
            <h1 className="lp-hero-headline">
              Know where medicines are.<br/>
              Move stock <em>before</em><br/>patients are affected.
            </h1>
            <p className="lp-hero-sub">
              Orela Nigeria connects pharmacies, clinics, hospitals, and distributors into a real-time medicine availability network — so stockouts can be prevented, not just discovered.
            </p>
            <div className="lp-hero-actions">
              <a href="/ng/auth" className="lp-btn-primary">
                Register your facility
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </a>
              <a href="#how" className="lp-btn-secondary">See how it works</a>
            </div>
            <div className="lp-hero-meta">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Built for pharmacies, hospitals, clinics, and health systems
            </div>
          </div>

          {/* Network panel */}
          <div className="lp-panel">
            <div className="lp-panel-header">
              <span className="lp-panel-title">Network Status · Lagos Region</span>
              <div className="lp-panel-online"><div className="lp-online-dot"></div>All systems operational</div>
            </div>
            <div className="lp-panel-body">
              <div className="lp-topo-label">Facility types connected</div>
              <div className="lp-topo-grid">
                <div className="lp-topo-node">
                  <div className="lp-topo-status" style={{background:'#22c55e'}}></div>
                  <div className="lp-topo-icon" style={{background:'rgba(25,194,181,0.08)',border:'1px solid rgba(25,194,181,0.2)'}}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#19c2b5" strokeWidth="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>
                  </div>
                  <div className="lp-topo-txt">Pharmacy</div>
                </div>
                <div className="lp-topo-node">
                  <div className="lp-topo-status" style={{background:'#22c55e'}}></div>
                  <div className="lp-topo-icon" style={{background:'rgba(56,189,248,0.08)',border:'1px solid rgba(56,189,248,0.2)'}}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="1.8"><path d="M8 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/><path d="M17 21v-6"/><path d="M14 18h6"/></svg>
                  </div>
                  <div className="lp-topo-txt">Hospital</div>
                </div>
                <div className="lp-topo-node">
                  <div className="lp-topo-status" style={{background:'#f5a524'}}></div>
                  <div className="lp-topo-icon" style={{background:'rgba(245,165,36,0.08)',border:'1px solid rgba(245,165,36,0.2)'}}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#f5a524" strokeWidth="1.8"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                  </div>
                  <div className="lp-topo-txt">Clinic</div>
                </div>
                <div className="lp-topo-node">
                  <div className="lp-topo-status" style={{background:'#22c55e'}}></div>
                  <div className="lp-topo-icon" style={{background:'rgba(139,92,246,0.08)',border:'1px solid rgba(139,92,246,0.2)'}}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="1.8"><rect x="1" y="3" width="15" height="13"/><polygon points="16,8 20,8 23,11 23,16 16,16 16,8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                  </div>
                  <div className="lp-topo-txt">Distributor</div>
                </div>
              </div>
              <div className="lp-divider"></div>
              <div className="lp-topo-label" style={{marginBottom:'6px'}}>Network summary</div>
              <div className="lp-summary-grid">
                <div className="lp-sum-item"><div className="lp-sum-num" style={{color:'#19c2b5'}}>Live</div><div className="lp-sum-label">Availability data</div></div>
                <div className="lp-sum-item"><div className="lp-sum-num" style={{color:'#f5a524'}}>Auto</div><div className="lp-sum-label">Shortage alerts</div></div>
                <div className="lp-sum-item"><div className="lp-sum-num" style={{color:'#22c55e'}}>Free</div><div className="lp-sum-label">Beta access</div></div>
              </div>
              <div className="lp-divider"></div>
              <div className="lp-fac-sec-label">Lagos pilot · founding cohort</div>
              <div style={{padding:'12px 0',fontSize:12,color:'#4a6d8c',lineHeight:1.6}}>
                We are onboarding the first verified facilities in Lagos. Registration is open now — no cost during beta.
              </div>
              <a href="/ng/auth" style={{display:'inline-flex',alignItems:'center',gap:6,padding:'8px 14px',background:'rgba(25,194,181,0.1)',border:'1px solid rgba(25,194,181,0.2)',borderRadius:5,color:'#19c2b5',fontSize:12,fontWeight:600,textDecoration:'none'}}>
                Register your facility →
              </a>
            </div>
          </div>
        </section>

        {/* STAT BAR */}
        <div className="lp-stat-bar">
          <div className="lp-stat-item"><span className="lp-stat-num">Real-time</span><span className="lp-stat-label">Medicine availability</span></div>
          <div className="lp-stat-item"><span className="lp-stat-num">Verified</span><span className="lp-stat-label">Facility network</span></div>
          <div className="lp-stat-item"><span className="lp-stat-num">Secure</span><span className="lp-stat-label">Data segregation</span></div>
          <div className="lp-stat-item"><span className="lp-stat-num">Free</span><span className="lp-stat-label">During beta</span></div>
        </div>

        {/* PROBLEM */}
        <section className="lp-section lp-section-pad">
          <div className="lp-container">
            <div className="lp-section-label">The problem</div>
            <h2 className="lp-problem-headline">Medicines exist nearby.<br/><em>But no one knows where.</em></h2>
            <div className="lp-problem-grid">
              <div className="lp-problem-card"><div className="lp-p-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></div><div className="lp-p-title">Invisible surplus</div><div className="lp-p-desc">Pharmacies and hospitals sit on excess stock — including near-expiry medicines — with no way to offer it to facilities that need it.</div></div>
              <div className="lp-problem-card"><div className="lp-p-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div><div className="lp-p-title">Undetected shortages</div><div className="lp-p-desc">Stockouts are discovered at the dispensing counter, not before. By then, patients are already affected and alternatives take days to source.</div></div>
              <div className="lp-problem-card"><div className="lp-p-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.37 2 2 0 0 1 3.58 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.56a16 16 0 0 0 5.55 5.55l1.62-1.62a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 14.92z"/></svg></div><div className="lp-p-title">Manual coordination</div><div className="lp-p-desc">When a facility runs out, they call around. WhatsApp groups. Personal contacts. Hours lost. No visibility, no trust, no system.</div></div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="lp-section lp-section-pad" id="how" style={{borderTop:'1px solid #1a3050'}}>
          <div className="lp-container">
            <div className="lp-section-label">How it works</div>
            <div className="lp-how-grid">
              <div>
                <h2 className="lp-how-headline">Three steps to a connected supply network</h2>
                <div className="lp-steps">
                  <div className="lp-step"><span className="lp-step-num">01</span><div><div className="lp-step-title">Register and publish your inventory</div><div className="lp-step-desc">Create your facility profile and add medicine stock. Your inventory immediately powers real-time availability intelligence — visible to other verified facilities in the network.</div></div></div>
                  <div className="lp-step"><span className="lp-step-num">02</span><div><div className="lp-step-title">Search the network when stock runs low</div><div className="lp-step-desc">Query by medicine name and location. See real availability at verified nearby facilities — quantity, expiry date, facility type — without exposing sensitive pricing or supplier data.</div></div></div>
                  <div className="lp-step"><span className="lp-step-num">03</span><div><div className="lp-step-title">Request a transfer. Prevent the stockout.</div><div className="lp-step-desc">Submit a structured transfer request. The supplying facility approves and dispatches — fully tracked with email notifications and a complete audit trail at every stage.</div></div></div>
                </div>
              </div>
              <div className="lp-cmd">
                <div className="lp-cmd-bar"><div className="lp-cmd-dot" style={{background:'#ef4444'}}></div><div className="lp-cmd-dot" style={{background:'#f5a524'}}></div><div className="lp-cmd-dot" style={{background:'#22c55e'}}></div><span className="lp-cmd-url">app.orela.africa · Medicine Network</span></div>
                <div className="lp-cmd-body">
                  <div className="lp-cmd-eyebrow">Medicine Network · Real-time search</div>
                  <div className="lp-cmd-title">Amoxicillin 500mg — Lagos</div>
                  <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:12}}>
                    {[
                      {name:'Hospital Pharmacy · Victoria Island', qty:'240 capsules', exp:'Aug 2026', color:'#22c55e'},
                      {name:'Independent Pharmacy · Surulere', qty:'80 capsules', exp:'Nov 2025', color:'#f5a524'},
                      {name:'PHC · Agege', qty:'500 capsules', exp:'Mar 2026', color:'#22c55e'},
                    ].map((r,i) => (
                      <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 8px',background:'#0e2038',border:'1px solid #1a3050',borderRadius:4}}>
                        <div style={{width:5,height:5,borderRadius:'50%',background:r.color,flexShrink:0}}/>
                        <span style={{fontSize:10,color:'#8bb4d4',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.name}</span>
                        <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:9,color:'#19c2b5',flexShrink:0}}>{r.qty}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{display:'flex',gap:6}}>
                    <div style={{flex:1,background:'#0e2038',border:'1px solid #1a3050',borderRadius:4,padding:'8px 10px'}}>
                      <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:11,color:'#19c2b5',marginBottom:2}}>820</div>
                      <div style={{fontSize:8,color:'#4a6d8c',textTransform:'uppercase',letterSpacing:'0.08em'}}>Units available</div>
                    </div>
                    <div style={{flex:1,background:'#0e2038',border:'1px solid #1a3050',borderRadius:4,padding:'8px 10px'}}>
                      <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:11,color:'#8b5cf6',marginBottom:2}}>3</div>
                      <div style={{fontSize:8,color:'#4a6d8c',textTransform:'uppercase',letterSpacing:'0.08em'}}>Nearby sources</div>
                    </div>
                    <div style={{flex:1,background:'#0e2038',border:'1px solid #1a3050',borderRadius:4,padding:'8px 10px'}}>
                      <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:11,color:'#22c55e',marginBottom:2}}>Live</div>
                      <div style={{fontSize:8,color:'#4a6d8c',textTransform:'uppercase',letterSpacing:'0.08em'}}>Availability</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FACILITY NETWORK */}
        <section className="lp-section lp-section-pad" id="network" style={{borderTop:'1px solid #1a3050'}}>
          <div className="lp-container">
            <div className="lp-section-label">Facility network</div>
            <h2 style={{fontSize:'clamp(22px,3.5vw,38px)',fontWeight:700,letterSpacing:'-0.025em',maxWidth:'540px',lineHeight:1.2,color:'#f0f6ff'}}>Every facility that touches medicine supply in Africa</h2>
            <div className="lp-who-grid">
              <div className="lp-who-card"><div className="lp-who-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg></div><div className="lp-who-title">Independent Pharmacies</div><div className="lp-who-desc">Publish stock to the network, source from nearby verified facilities, and redistribute near-expiry stock before it's wasted.</div></div>
              <div className="lp-who-card"><div className="lp-who-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/><path d="M17 21v-6"/><path d="M14 18h6"/></svg></div><div className="lp-who-title">Hospitals &amp; Clinics</div><div className="lp-who-desc">Monitor essential medicine coverage continuously. Get shortage alerts before they reach patients and coordinate emergency transfers.</div></div>
              <div className="lp-who-card"><div className="lp-who-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg></div><div className="lp-who-title">Primary Health Centers</div><div className="lp-who-desc">Access network supply when government stock runs short. Know which nearby facilities have what your patients need right now.</div></div>
              <div className="lp-who-card"><div className="lp-who-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="1" y="3" width="15" height="13"/><polygon points="16,8 20,8 23,11 23,16 16,16 16,8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg></div><div className="lp-who-title">Distributors &amp; Wholesalers</div><div className="lp-who-desc">See real demand signals from the network. Understand which medicines are moving fastest and where shortages are emerging.</div></div>
              <div className="lp-who-card"><div className="lp-who-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div><div className="lp-who-title">NGOs &amp; Health Programs</div><div className="lp-who-desc">Monitor essential medicine availability across your facility networks. Identify supply gaps and redistribution opportunities across regions.</div></div>
              <div className="lp-who-card"><div className="lp-who-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></div><div className="lp-who-title">Government &amp; Health Systems</div><div className="lp-who-desc">Track essential medicine coverage by region. Get early warning signals on emerging shortages across public facilities.</div></div>
            </div>
          </div>
        </section>

        {/* PLATFORM CAPABILITIES */}
        <section className="lp-section lp-section-pad" style={{borderTop:'1px solid #1a3050'}}>
          <div className="lp-container">
            <div className="lp-section-label">Platform capabilities</div>
            <div className="lp-features-grid">
              <div className="lp-feature-card"><span className="lp-feature-tag">Network</span><div className="lp-feature-title">Real-time medicine availability search</div><div className="lp-feature-desc">Query by medicine name and location. See verified stock availability — quantity, expiry, facility type — across the entire network instantly. Role-based access ensures only authorised facilities can see each other's data.</div><div className="lp-feature-surface">Surface: Medicine Network · Search console</div></div>
              <div className="lp-feature-card"><span className="lp-feature-tag">Intelligence</span><div className="lp-feature-title">Shortage alerts before they reach patients</div><div className="lp-feature-desc">Automatic alerts when stock falls below reorder level or approaches expiry. Know your risk position continuously, not at the point of dispensing. Alert logic runs at the database level — no polling required.</div><div className="lp-feature-surface">Surface: Shortage Alerts · Facility command center</div></div>
              <div className="lp-feature-card"><span className="lp-feature-tag">Redistribution</span><div className="lp-feature-title">Structured transfer coordination</div><div className="lp-feature-desc">Request stock from network facilities with a structured approval workflow. Every transfer is tracked from request to delivery — with full audit trail, quantity reservation, and email notifications at each stage.</div><div className="lp-feature-surface">Surface: Redistribution · Transfer pipeline</div></div>
              <div className="lp-feature-card"><span className="lp-feature-tag">Trust</span><div className="lp-feature-title">Verified facility network with data governance</div><div className="lp-feature-desc">Only verified facilities appear in network search. Sensitive data — supplier details, cost pricing, contact information — is protected by row-level security and only shared after a transfer is agreed between both parties.</div><div className="lp-feature-surface">Surface: Network identity · Security &amp; compliance</div></div>
            </div>
          </div>
        </section>

        {/* TRUST */}
        <section className="lp-trust">
          <div className="lp-trust-inner">
            <div className="lp-trust-quote">"The local health ecosystem should know where trusted medicine supply exists and be able to move it before stockouts hurt patients."</div>
            <div className="lp-trust-attr">The Orela Nigeria thesis</div>
            <div className="lp-trust-items">
              <div className="lp-trust-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4"/><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/></svg>Secure infrastructure</div>
              <div className="lp-trust-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4"/><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/></svg>Data segregated between facilities</div>
              <div className="lp-trust-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4"/><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/></svg>Nigeria-first, Africa-ready</div>
              <div className="lp-trust-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4"/><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/></svg>Works on any device</div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="lp-cta">
          <h2 className="lp-cta-headline">Join the network.<br/><em>Before the next stockout.</em></h2>
          <p className="lp-cta-sub">Register your facility in minutes. Add your inventory. Become part of Africa's medicine availability network.</p>
          <a href="/ng/auth" className="lp-btn-primary" style={{fontSize:'15px',padding:'12px 30px'}}>Register your facility →</a>
          <p className="lp-cta-note">Free during beta · No credit card required · orela.africa/ng</p>
        </section>

        {/* FOOTER */}
        <footer className="lp-footer">
          <div style={{fontSize:11,color:'#1e3a52',width:'100%',marginBottom:4}}>© 2026 Orela Network. All rights reserved.</div>
          <div className="lp-footer-brand">
            <div className="lp-nav-logo" style={{width:'20px',height:'20px'}}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:'10px',height:'10px',color:'#050f1a'}}><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><path d="M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>
            </div>
            Orela Nigeria · Medicine availability infrastructure
          </div>
          <div className="lp-footer-links">
            <a href="/ng/auth">Sign in</a>
            <a href="/ng/docs">Docs</a>
            <a href="/ng/medicine-alerts">Drug Safety Alerts</a>
            <a href="/ng/status">Status</a>
            <a href="/ng/privacy">Privacy</a>
            <a href="mailto:hello@orela.africa">hello@orela.africa</a>
          </div>
        </footer>
      </div>
    </>
  )
}
