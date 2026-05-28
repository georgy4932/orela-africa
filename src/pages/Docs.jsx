// src/pages/Docs.jsx
// Public documentation — facility admins and technical users

export default function DocsPage() {
  return (
    <>
      <style>{`
        .d *, .d *::before, .d *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .d {
          font-family: 'DM Sans', -apple-system, sans-serif;
          background: #050f1a;
          color: #f0f6ff;
          line-height: 1.6;
          overflow-x: hidden;
          min-height: 100vh;
        }
        .d::before {
          content: ''; position: fixed; inset: 0;
          background-image: linear-gradient(rgba(25,194,181,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(25,194,181,0.02) 1px,transparent 1px);
          background-size: 48px 48px; pointer-events: none; z-index: 0;
        }

        /* NAV */
        .d-nav { position: fixed; top:0;left:0;right:0; z-index:100; display:flex; align-items:center; justify-content:space-between; padding:0 48px; height:56px; background:rgba(5,15,26,0.95); backdrop-filter:blur(20px); border-bottom:1px solid #1a3050; }
        .d-brand { display:flex; align-items:center; gap:9px; text-decoration:none; }
        .d-logo { width:26px;height:26px; background:#19c2b5; border-radius:5px; display:flex;align-items:center;justify-content:center; }
        .d-logo svg { width:12px;height:12px; color:#050f1a; }
        .d-brand-name { font-size:14px;font-weight:600;color:#f0f6ff;letter-spacing:-0.02em; }
        .d-brand-tag { font-size:11px;color:#4a6d8c;margin-left:4px; }
        .d-nav-right { display:flex;align-items:center;gap:12px; }
        .d-back { font-size:13px;color:#8bb4d4;text-decoration:none;display:flex;align-items:center;gap:5px;transition:color 0.15s; }
        .d-back:hover { color:#f0f6ff; }
        .d-cta { display:inline-flex;align-items:center;gap:6px;padding:7px 16px;background:#19c2b5;color:#050f1a;font-size:13px;font-weight:600;border-radius:5px;text-decoration:none;transition:background 0.15s; }
        .d-cta:hover { background:#12a79c; }

        /* LAYOUT */
        .d-layout { display:grid; grid-template-columns:256px 1fr; min-height:100vh; padding-top:56px; position:relative;z-index:1; }

        /* SIDEBAR */
        .d-sidebar { position:sticky;top:56px;height:calc(100vh - 56px);overflow-y:auto;padding:28px 16px;border-right:1px solid #1a3050;background:#050f1a; }
        .d-sb-group { margin-bottom:24px; }
        .d-sb-label { font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:#4a6d8c;margin-bottom:6px;display:block;padding:0 8px; }
        .d-sb-link { display:block;font-size:12.5px;color:#8bb4d4;text-decoration:none;padding:5px 8px;border-radius:4px;transition:all 0.15s;margin-bottom:1px; }
        .d-sb-link:hover { color:#f0f6ff;background:#0e2038; }
        .d-sb-link.active { color:#19c2b5;background:rgba(25,194,181,0.08);font-weight:500; }
        .d-sb-divider { height:1px;background:#1a3050;margin:16px 0; }
        .d-sb-contact { padding:0 8px; }
        .d-sb-contact-label { font-size:10px;color:#4a6d8c;margin-bottom:6px; }
        .d-sb-contact a { font-size:12px;color:#19c2b5;text-decoration:none; }

        /* CONTENT */
        .d-content { padding:48px 72px 96px;max-width:820px; }

        /* HERO */
        .d-hero { margin-bottom:56px;padding-bottom:40px;border-bottom:1px solid #1a3050; }
        .d-hero-eyebrow { font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:#19c2b5;margin-bottom:12px; }
        .d-hero-title { font-size:36px;font-weight:700;letter-spacing:-0.03em;color:#f0f6ff;margin-bottom:12px;line-height:1.15; }
        .d-hero-sub { font-size:15px;color:#8bb4d4;line-height:1.7;max-width:580px;font-weight:300;margin-bottom:24px; }
        .d-audience-tabs { display:flex;gap:8px; }
        .d-audience-tab { display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:5px;font-size:12px;font-weight:500;border:1px solid #1a3050;color:#8bb4d4;text-decoration:none; }
        .d-audience-tab.facility { background:rgba(25,194,181,0.08);border-color:rgba(25,194,181,0.2);color:#19c2b5; }
        .d-audience-tab.technical { background:rgba(139,92,246,0.08);border-color:rgba(139,92,246,0.2);color:#8b5cf6; }

        /* SECTIONS */
        .d-section { margin-bottom:64px;scroll-margin-top:80px; }
        .d-section-title { font-size:22px;font-weight:700;letter-spacing:-0.025em;color:#f0f6ff;margin-bottom:8px;display:flex;align-items:center;gap:10px; }
        .d-section-badge { font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;padding:2px 8px;border-radius:3px; }
        .d-section-desc { font-size:14px;color:#8bb4d4;margin-bottom:24px;line-height:1.65; }
        .d-subsection { margin-bottom:32px; }
        .d-subsection-title { font-size:16px;font-weight:600;color:#f0f6ff;margin-bottom:8px;letter-spacing:-0.01em; }
        .d-subsection-desc { font-size:13px;color:#8bb4d4;line-height:1.65;margin-bottom:14px; }

        /* STEPS */
        .d-steps { display:flex;flex-direction:column; }
        .d-step { display:flex;gap:20px;padding:20px 0;border-bottom:1px solid #1a3050; }
        .d-step:last-child { border-bottom:none; }
        .d-step-num { font-family:'JetBrains Mono',monospace;font-size:10px;color:#19c2b5;font-weight:500;flex-shrink:0;padding-top:3px;width:28px; }
        .d-step-title { font-size:14px;font-weight:600;color:#f0f6ff;margin-bottom:5px;letter-spacing:-0.01em; }
        .d-step-desc { font-size:13px;color:#8bb4d4;line-height:1.65; }

        /* CARDS */
        .d-grid-2 { display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px; }
        .d-card { background:#0a1828;border:1px solid #1a3050;border-radius:8px;padding:18px 20px; }
        .d-card-title { font-size:13.5px;font-weight:600;color:#f0f6ff;margin-bottom:6px;letter-spacing:-0.01em; }
        .d-card-desc { font-size:12.5px;color:#8bb4d4;line-height:1.65; }

        /* CODE */
        .d-code-block { background:#030a12;border:1px solid #1a3050;border-radius:7px;padding:16px 18px;font-family:'JetBrains Mono',monospace;font-size:12px;color:#8bb4d4;line-height:1.7;overflow-x:auto;margin-bottom:14px; }
        .d-code-block .kw { color:#19c2b5; }
        .d-code-block .str { color:#f5a524; }
        .d-code-block .cm { color:#344e6a; }
        .d-code-block .num { color:#8b5cf6; }
        .d-code-label { font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#4a6d8c;margin-bottom:6px; }
        .d-inline-code { font-family:'JetBrains Mono',monospace;font-size:11.5px;background:#0a1828;border:1px solid #1a3050;padding:1px 6px;border-radius:3px;color:#19c2b5; }

        /* NOTES */
        .d-note { display:flex;gap:10px;padding:13px 15px;border-radius:7px;font-size:13px;line-height:1.6;margin-bottom:16px; }
        .d-note-tip { background:rgba(25,194,181,0.06);border:1px solid rgba(25,194,181,0.15);color:#8bb4d4; }
        .d-note-warn { background:rgba(245,165,36,0.06);border:1px solid rgba(245,165,36,0.15);color:#8bb4d4; }
        .d-note-info { background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.15);color:#8bb4d4; }
        .d-note-icon { flex-shrink:0;font-size:13px;margin-top:1px; }

        /* TABLE */
        .d-table-wrap { border-radius:8px;overflow:hidden;border:1px solid #1a3050;margin-bottom:16px; }
        .d-table { width:100%;border-collapse:collapse;font-size:13px; }
        .d-table th { padding:9px 14px;background:#0e2038;text-align:left;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#4a6d8c;border-bottom:1px solid #1a3050; }
        .d-table td { padding:10px 14px;border-bottom:1px solid #1a3050;color:#8bb4d4;vertical-align:top; }
        .d-table tr:last-child td { border-bottom:none; }
        .d-table td:first-child { color:#f0f6ff;font-weight:500; }
        .d-badge { display:inline-flex;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;padding:2px 7px;border-radius:3px; }

        /* TRANSFER FLOW */
        .d-flow { display:flex;flex-direction:column;margin-bottom:20px; }
        .d-flow-step { display:flex;gap:14px;align-items:flex-start; }
        .d-flow-spine { display:flex;flex-direction:column;align-items:center;flex-shrink:0; }
        .d-flow-dot { width:10px;height:10px;border-radius:50%;margin-top:4px; }
        .d-flow-line { width:1px;height:28px;background:#1a3050; }
        .d-flow-body { padding-bottom:16px; }
        .d-flow-status { font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;padding:2px 6px;border-radius:3px;display:inline-flex;margin-bottom:4px; }
        .d-flow-desc { font-size:12.5px;color:#8bb4d4;line-height:1.6; }

        /* FAQ */
        .d-faq-item { border-bottom:1px solid #1a3050;padding:18px 0; }
        .d-faq-item:last-child { border-bottom:none; }
        .d-faq-q { font-size:14px;font-weight:600;color:#f0f6ff;margin-bottom:7px;letter-spacing:-0.01em; }
        .d-faq-a { font-size:13px;color:#8bb4d4;line-height:1.65; }
        .d-faq-a a { color:#19c2b5; }

        /* ENDPOINT */
        .d-endpoint { background:#030a12;border:1px solid #1a3050;border-radius:7px;padding:14px 16px;margin-bottom:12px;display:flex;align-items:flex-start;gap:12px; }
        .d-method { font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;padding:3px 8px;border-radius:3px;flex-shrink:0;margin-top:1px; }
        .d-method-get { background:rgba(25,194,181,0.1);color:#19c2b5; }
        .d-method-post { background:rgba(139,92,246,0.1);color:#8b5cf6; }
        .d-method-patch { background:rgba(245,165,36,0.1);color:#f5a524; }
        .d-endpoint-path { font-family:'JetBrains Mono',monospace;font-size:12px;color:#f0f6ff;margin-bottom:3px; }
        .d-endpoint-desc { font-size:12px;color:#8bb4d4; }

        /* CTA */
        .d-cta-box { background:rgba(25,194,181,0.06);border:1px solid rgba(25,194,181,0.15);border-radius:10px;padding:28px;text-align:center;margin-top:48px; }
        .d-cta-title { font-size:18px;font-weight:700;color:#f0f6ff;margin-bottom:8px;letter-spacing:-0.02em; }
        .d-cta-desc { font-size:13px;color:#8bb4d4;margin-bottom:20px;line-height:1.6; }
        .d-btn { display:inline-flex;align-items:center;gap:7px;padding:10px 22px;background:#19c2b5;color:#050f1a;font-size:14px;font-weight:600;border-radius:6px;text-decoration:none;transition:background 0.15s; }
        .d-btn:hover { background:#12a79c; }

        /* RESPONSIVE */
        @media (max-width:900px) {
          .d-nav { padding:0 24px; }
          .d-layout { grid-template-columns:1fr; }
          .d-sidebar { display:none; }
          .d-content { padding:32px 24px 64px; }
          .d-grid-2 { grid-template-columns:1fr; }
        }
      `}</style>

      <div className="d">
        {/* NAV */}
        <nav className="d-nav">
          <a href="/ng" className="d-brand">
            <div className="d-logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><path d="M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg></div>
            <span className="d-brand-name">Orela Nigeria</span>
            <span className="d-brand-tag">/ Docs</span>
          </a>
          <div className="d-nav-right">
            <a href="/ng" className="d-back">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              Back to site
            </a>
            <a href="/auth" className="d-cta">Register your facility →</a>
          </div>
        </nav>

        <div className="d-layout">
          {/* SIDEBAR */}
          <aside className="d-sidebar">
            <div className="d-sb-group">
              <span className="d-sb-label">Introduction</span>
              <a href="#overview" className="d-sb-link active">Overview</a>
              <a href="#concepts" className="d-sb-link">Core concepts</a>
              <a href="#audience" className="d-sb-link">Who is this for</a>
            </div>
            <div className="d-sb-group">
              <span className="d-sb-label">Facility guide</span>
              <a href="#register" className="d-sb-link">1. Register your facility</a>
              <a href="#inventory" className="d-sb-link">2. Add inventory</a>
              <a href="#search" className="d-sb-link">3. Search the network</a>
              <a href="#alerts" className="d-sb-link">4. Shortage alerts</a>
              <a href="#staff" className="d-sb-link">5. Staff management</a>
              <a href="#settings" className="d-sb-link">6. Facility settings</a>
            </div>
            <div className="d-sb-group">
              <span className="d-sb-label">Transfers</span>
              <a href="#transfers-overview" className="d-sb-link">How transfers work</a>
              <a href="#requesting" className="d-sb-link">Requesting stock</a>
              <a href="#supplying" className="d-sb-link">Supplying stock</a>
              <a href="#transfer-lifecycle" className="d-sb-link">Transfer lifecycle</a>
              <a href="#email-notifications" className="d-sb-link">Email notifications</a>
            </div>
            <div className="d-sb-group">
              <span className="d-sb-label">Supply Intelligence</span>
              <a href="#intelligence" className="d-sb-link">Analytics overview</a>
              <a href="#coverage" className="d-sb-link">Medicine coverage</a>
              <a href="#shortage-signals" className="d-sb-link">Shortage signals</a>
            </div>
            <div className="d-sb-group">
              <span className="d-sb-label">Reference</span>
              <a href="#roles" className="d-sb-link">Roles & permissions</a>
              <a href="#facility-types" className="d-sb-link">Facility types</a>
              <a href="#medicine-catalog" className="d-sb-link">Medicine catalog</a>
              <a href="#faq" className="d-sb-link">FAQ</a>
              <a href="#uniqueness" className="d-sb-link">Is this unique?</a>
            </div>
            <div className="d-sb-divider"></div>
            <div className="d-sb-contact">
              <div className="d-sb-contact-label">Need help?</div>
              <a href="mailto:hello@orela.africa">hello@orela.africa</a>
            </div>
          </aside>

          {/* CONTENT */}
          <main className="d-content">

            {/* HERO */}
            <div className="d-hero">
              <div className="d-hero-eyebrow">Documentation · v1.0 · Beta</div>
              <h1 className="d-hero-title">Orela Nigeria<br/>Platform Documentation</h1>
              <p className="d-hero-sub">Complete guide for facility administrators. Covers everything from registering your facility to managing inventory, transfers, and supply intelligence.</p>
              <div className="d-audience-tabs">
                <span className="d-audience-tab facility">🏥 Facility administrators</span>
              </div>
            </div>

            {/* OVERVIEW */}
            <div className="d-section" id="overview">
              <div className="d-section-title"><span className="d-section-badge" style={{background:'rgba(25,194,181,0.1)',color:'#19c2b5'}}>Intro</span>What is Orela Nigeria?</div>
              <p className="d-section-desc">Orela Nigeria is a medicine availability and pharmaceutical supply intelligence network. It connects pharmacies, clinics, hospitals, distributors, and health centers so that medicine supply can be located, requested, and moved before stockouts affect patients.</p>
              <div className="d-grid-2">
                <div className="d-card"><div className="d-card-title">The core problem</div><div className="d-card-desc">Medicines exist nearby but no one knows where. Stockouts are discovered at the dispensing counter. Coordination happens through WhatsApp and phone calls. No visibility, no trust, no system.</div></div>
                <div className="d-card"><div className="d-card-title">The Orela solution</div><div className="d-card-desc">A verified facility network with real-time inventory visibility, structured transfer coordination, automatic shortage alerts, and supply intelligence — all built on secure, segregated infrastructure.</div></div>
              </div>
              <div className="d-note d-note-tip"><span className="d-note-icon">💡</span><span>The platform is free for all facilities during the beta period. Launching in Nigeria, expanding across Africa.</span></div>
            </div>

            {/* CORE CONCEPTS */}
            <div className="d-section" id="concepts">
              <div className="d-section-title">Core concepts</div>
              <div className="d-grid-2">
                <div className="d-card"><div className="d-card-title">Facility</div><div className="d-card-desc">Any healthcare entity on the network — pharmacy, hospital, clinic, PHC, distributor, wholesaler, or NGO. Each facility has its own verified identity, inventory, staff, and settings.</div></div>
                <div className="d-card"><div className="d-card-title">Inventory item</div><div className="d-card-desc">A specific batch of a medicine at a facility. Tracks quantity available, quantity reserved, reorder level, expiry date, batch number, and supply chain details.</div></div>
                <div className="d-card"><div className="d-card-title">Medicine network</div><div className="d-card-desc">The aggregated real-time view of medicine availability across all verified facilities. Searchable by medicine name, location, and dosage form.</div></div>
                <div className="d-card"><div className="d-card-title">Transfer</div><div className="d-card-desc">A structured stock redistribution request between two facilities. Managed through a defined lifecycle: Pending → Approved → In Transit → Fulfilled.</div></div>
                <div className="d-card"><div className="d-card-title">Stock alert</div><div className="d-card-desc">An automatic signal generated when stock falls below reorder level, reaches zero, or approaches expiry. Triggers in-platform notifications and email alerts.</div></div>
                <div className="d-card"><div className="d-card-title">Quantity reserved</div><div className="d-card-desc">Stock committed to an approved transfer. Cannot be used for other purposes until the transfer is fulfilled or cancelled. Managed entirely by the transfer RPC layer.</div></div>
              </div>
            </div>

            {/* AUDIENCE */}
            <div className="d-section" id="audience">
              <div className="d-section-title">Who this documentation is for</div>
              <div className="d-grid-2">
                <div className="d-card" style={{borderColor:'rgba(25,194,181,0.2)'}}>
                  <div className="d-card-title" style={{color:'#19c2b5'}}>Facility administrators</div>
                  <div className="d-card-desc">Pharmacists, hospital pharmacy managers, PHC coordinators, and anyone responsible for registering and operating a facility on the network. This guide covers registration, inventory, transfers, alerts, and supply intelligence.</div>
                </div>
              </div>
            </div>

            {/* REGISTER */}
            <div className="d-section" id="register">
              <div className="d-section-title"><span className="d-section-badge" style={{background:'rgba(25,194,181,0.1)',color:'#19c2b5'}}>01</span>Register your facility</div>
              <p className="d-section-desc">Registration takes approximately 5 minutes. You will need your facility name, type, location, and registration number (PCN / NAFDAC / PPB).</p>
              <div className="d-steps">
                <div className="d-step"><span className="d-step-num">01</span><div><div className="d-step-title">Create an account at orela.africa/ng/auth</div><div className="d-step-desc">Sign up with your email address. Use a working email — all shortage alerts and transfer notifications are sent there. A verification email may be sent depending on your region's auth settings.</div></div></div>
                <div className="d-step"><span className="d-step-num">02</span><div><div className="d-step-title">Complete Facility Identity</div><div className="d-step-desc">Enter your facility name, type, phone number, facility email, and registration number. The facility email is used for notification delivery and may differ from your login email.</div></div></div>
                <div className="d-step"><span className="d-step-num">03</span><div><div className="d-step-title">Set your location</div><div className="d-step-desc">Enter your full address: street, city, state/province, and country. Location powers the medicine network search — other facilities use city and state to find supply nearby. This data is visible to other verified facilities in search results.</div></div></div>
                <div className="d-step"><span className="d-step-num">04</span><div><div className="d-step-title">Configure operational settings</div><div className="d-step-desc">Set your default currency (e.g. NGN) and near-expiry threshold in days (default: 90). The threshold determines how far in advance near-expiry alerts fire. You can change this later in Settings → Network Settings.</div></div></div>
              </div>
              <div className="d-note d-note-warn"><span className="d-note-icon">⚠</span><span>Your facility is marked <strong style={{color:'#f0f6ff'}}>Unverified</strong> after registration. Verification is currently manual. Email <a href="mailto:hello@orela.africa" style={{color:'#19c2b5'}}>hello@orela.africa</a> to expedite. Verified facilities show a green badge in network search results.</span></div>
            </div>

            {/* INVENTORY */}
            <div className="d-section" id="inventory">
              <div className="d-section-title"><span className="d-section-badge" style={{background:'rgba(25,194,181,0.1)',color:'#19c2b5'}}>02</span>Add inventory</div>
              <p className="d-section-desc">Each batch of medicine you add is immediately published to the medicine availability network. Your inventory is the data source that powers network intelligence.</p>
              <div className="d-steps">
                <div className="d-step"><span className="d-step-num">1</span><div><div className="d-step-title">Go to Inventory → Add stock</div><div className="d-step-desc">The Add Stock modal requires: medicine (from catalog), batch number, expiry date, and initial quantity. All other fields are optional but recommended.</div></div></div>
                <div className="d-step"><span className="d-step-num">2</span><div><div className="d-step-title">Set the reorder level</div><div className="d-step-desc">This is the quantity at which a low-stock alert fires. Set it realistically — too low and you get alerts too late; too high and alerts become noise. Default is 10 units.</div></div></div>
                <div className="d-step"><span className="d-step-num">3</span><div><div className="d-step-title">Supply chain fields (optional but valuable)</div><div className="d-step-desc">Unit cost, selling price, supplier, storage condition, and storage location are visible only to your facility. They power your internal cost tracking and audit trail but are never shared with other facilities.</div></div></div>
                <div className="d-step"><span className="d-step-num">4</span><div><div className="d-step-title">Adjust stock quantities</div><div className="d-step-desc">Use the Adjust button on any batch to log stock movements: receipt, dispensed, adjustment, expired removal, or return. Every movement is recorded with a timestamp and audit trail. Never directly edit <span className="d-inline-code">quantity_available</span> — always use the Adjust workflow.</div></div></div>
              </div>
              <div className="d-note d-note-info"><span className="d-note-icon">ℹ</span><span>The <strong style={{color:'#f0f6ff'}}>Available</strong> column shows <span className="d-inline-code">quantity_available − quantity_reserved</span>. Reserved quantity is managed automatically by the transfer system and cannot be manually edited.</span></div>

              <div className="d-subsection">
                <div className="d-subsection-title">Essential medicines</div>
                <div className="d-subsection-desc">Medicines flagged as essential in the catalog display an ESSENTIAL badge in your inventory table. These are tracked separately for coverage scoring in the Supply Intelligence module. The list follows WHO Essential Medicines guidelines adapted for the Nigerian context.</div>
              </div>
            </div>

            {/* SEARCH */}
            <div className="d-section" id="search">
              <div className="d-section-title"><span className="d-section-badge" style={{background:'rgba(25,194,181,0.1)',color:'#19c2b5'}}>03</span>Search the medicine network</div>
              <p className="d-section-desc">Medicine Network is the primary network workflow. Use it to locate real-time medicine availability at other verified facilities near you.</p>
              <div className="d-steps">
                <div className="d-step"><span className="d-step-num">1</span><div><div className="d-step-title">Search by medicine name and location</div><div className="d-step-desc">Type the generic name (e.g. Amoxicillin, Artemether/Lumefantrine, Metformin 500mg). Filter by country, state, and city. You can also filter by dosage form.</div></div></div>
                <div className="d-step"><span className="d-step-num">2</span><div><div className="d-step-title">Review results</div><div className="d-step-desc">Results show: available quantity (net of reserved stock), earliest expiry date, number of batches, facility type, location, and verification status. Your own facility's stock appears in a separate section at the top.</div></div></div>
                <div className="d-step"><span className="d-step-num">3</span><div><div className="d-step-title">Request stock from a result</div><div className="d-step-desc">Click Request stock → on any network result to open the transfer request form, pre-filled with the medicine and supplying facility. Add your quantity, urgency, and reason.</div></div></div>
              </div>
            </div>

            {/* ALERTS */}
            <div className="d-section" id="alerts">
              <div className="d-section-title"><span className="d-section-badge" style={{background:'rgba(245,165,36,0.1)',color:'#f5a524'}}>04</span>Shortage alerts</div>
              <p className="d-section-desc">Alerts fire automatically based on database triggers. No manual setup required — they activate as soon as you add inventory.</p>
              <div className="d-table-wrap"><table className="d-table"><thead><tr><th>Alert type</th><th>Trigger condition</th><th>Severity</th></tr></thead><tbody>
                <tr><td>Out of stock</td><td>quantity_available reaches 0</td><td><span className="d-badge" style={{background:'rgba(239,68,68,0.1)',color:'#ef4444'}}>Critical</span></td></tr>
                <tr><td>Low stock</td><td>Available quantity falls below reorder_level</td><td><span className="d-badge" style={{background:'rgba(245,165,36,0.1)',color:'#f5a524'}}>Warning</span></td></tr>
                <tr><td>Near expiry</td><td>Days to expiry ≤ near_expiry_threshold_days</td><td><span className="d-badge" style={{background:'rgba(245,165,36,0.1)',color:'#f5a524'}}>Expiry risk</span></td></tr>
                <tr><td>Overstock</td><td>Quantity exceeds configured overstock threshold</td><td><span className="d-badge" style={{background:'rgba(56,189,248,0.1)',color:'#38bdf8'}}>Notice</span></td></tr>
              </tbody></table></div>
              <div className="d-note d-note-tip"><span className="d-note-icon">💡</span><span>Alert status is managed automatically. When stock is replenished above reorder level, the low_stock alert status changes to <span className="d-inline-code">resolved</span> automatically via the same trigger.</span></div>
            </div>

            {/* STAFF */}
            <div className="d-section" id="staff">
              <div className="d-section-title"><span className="d-section-badge" style={{background:'rgba(25,194,181,0.1)',color:'#19c2b5'}}>05</span>Staff management</div>
              <p className="d-section-desc">Each facility can have multiple staff members with different access levels. The first user to register a facility is automatically assigned Facility Admin.</p>
              <div className="d-table-wrap"><table className="d-table"><thead><tr><th>Role</th><th>Permissions</th></tr></thead><tbody>
                <tr><td><span className="d-badge" style={{background:'rgba(245,165,36,0.1)',color:'#f5a524'}}>Facility Admin</span></td><td>Full access: manage inventory, approve/action transfers, manage staff, view cost pricing, configure facility settings, deactivate facility.</td></tr>
                <tr><td><span className="d-badge" style={{background:'rgba(25,194,181,0.1)',color:'#19c2b5'}}>Pharmacist</span></td><td>Manage inventory (add, adjust), view and action transfers, search medicine network, view shortage alerts. Cannot manage staff or view cost pricing.</td></tr>
                <tr><td><span className="d-badge" style={{background:'rgba(139,180,212,0.1)',color:'#8bb4d4'}}>Pharmacy Tech</span></td><td>View inventory, log stock movements (Adjust). Cannot approve transfers, add inventory batches, or manage staff.</td></tr>
              </tbody></table></div>
              <div className="d-note d-note-tip"><span className="d-note-icon">💡</span><span>A user can be staff at multiple facilities with different roles at each.</span></div>
            </div>

            {/* SETTINGS */}
            <div className="d-section" id="settings">
              <div className="d-section-title"><span className="d-section-badge" style={{background:'rgba(25,194,181,0.1)',color:'#19c2b5'}}>06</span>Facility settings</div>
              <div className="d-grid-2">
                <div className="d-card"><div className="d-card-title">Network Identity</div><div className="d-card-desc">Facility name, type, phone, email, address, and logo URL. Changes update your facility's appearance in network search results immediately.</div></div>
                <div className="d-card"><div className="d-card-title">Network Settings</div><div className="d-card-desc">Default currency, near-expiry alert threshold (days), and reorder settings. These control how the alert system behaves for all inventory at this facility.</div></div>
                <div className="d-card"><div className="d-card-title">My Account</div><div className="d-card-desc">Personal profile: full name, phone, preferred country. Separate from facility settings — changes affect only your user profile.</div></div>
                <div className="d-card"><div className="d-card-title">Danger Zone</div><div className="d-card-desc">Deactivate facility. Removes the facility from network search and prevents new transfers. All data is preserved. Only system administrators can reactivate.</div></div>
              </div>
            </div>

            {/* TRANSFERS OVERVIEW */}
            <div className="d-section" id="transfers-overview">
              <div className="d-section-title">How transfers work</div>
              <p className="d-section-desc">A transfer is a structured stock redistribution request between two network facilities. All transfer state changes are managed through server-side RPC functions — no direct UPDATE to the transfer_requests table is permitted.</p>
              <div className="d-note d-note-tip"><span className="d-note-icon">💡</span><span>Stock is reserved at the supplying facility the moment a transfer is approved. Reserved stock cannot be used for other transfers or manually dispensed until the transfer is resolved (fulfilled, rejected, or cancelled).</span></div>
            </div>

            {/* REQUESTING */}
            <div className="d-section" id="requesting">
              <div className="d-section-title">Requesting stock</div>
              <div className="d-steps">
                <div className="d-step"><span className="d-step-num">1</span><div><div className="d-step-title">Find the medicine in Medicine Network</div><div className="d-step-desc">Identify a verified facility with available stock. Click Request stock → to open the transfer form, pre-filled with medicine and supplier details.</div></div></div>
                <div className="d-step"><span className="d-step-num">2</span><div><div className="d-step-title">Submit the request</div><div className="d-step-desc">Enter quantity needed, urgency (Normal / Urgent — stockout imminent / Critical — patients affected), and a reason. A detailed reason significantly increases approval rate. The supplying facility is notified by email immediately.</div></div></div>
                <div className="d-step"><span className="d-step-num">3</span><div><div className="d-step-title">Monitor in Redistribution</div><div className="d-step-desc">Track your outgoing requests in the Redistribution page, filtered to Outgoing. You will receive email notifications when the supplier approves, rejects, dispatches, or fulfils the transfer.</div></div></div>
                <div className="d-step"><span className="d-step-num">4</span><div><div className="d-step-title">Receive delivery</div><div className="d-step-desc">When stock arrives physically, the supplying facility marks it fulfilled. Your inventory is updated automatically. If stock hasn't arrived, contact the supplier directly via the facility email shown after approval.</div></div></div>
              </div>
            </div>

            {/* SUPPLYING */}
            <div className="d-section" id="supplying">
              <div className="d-section-title">Supplying stock</div>
              <div className="d-steps">
                <div className="d-step"><span className="d-step-num">1</span><div><div className="d-step-title">Receive and review the request</div><div className="d-step-desc">You are notified by email. In Redistribution → Incoming, you will see the requesting facility, medicine, quantity, urgency, and reason provided.</div></div></div>
                <div className="d-step"><span className="d-step-num">2</span><div><div className="d-step-title">Approve or decline</div><div className="d-step-desc">Click Approve transfer to select which batch to draw from and confirm the quantity approved (up to the amount requested). The selected batch's quantity_reserved increases immediately. Or click Decline with a reason — the requesting facility is notified.</div></div></div>
                <div className="d-step"><span className="d-step-num">3</span><div><div className="d-step-title">Dispatch the stock</div><div className="d-step-desc">When you physically hand over or dispatch the stock, click Mark dispatched. The requesting facility is notified that medicine is in transit.</div></div></div>
                <div className="d-step"><span className="d-step-num">4</span><div><div className="d-step-title">Confirm delivery</div><div className="d-step-desc">Click Confirm delivery when the requesting facility has received the stock. Enter the actual quantity delivered. The reserved quantity is removed from your inventory and the transfer closes.</div></div></div>
              </div>
            </div>

            {/* LIFECYCLE */}
            <div className="d-section" id="transfer-lifecycle">
              <div className="d-section-title">Transfer lifecycle</div>
              <div className="d-flow">
                <div className="d-flow-step"><div className="d-flow-spine"><div className="d-flow-dot" style={{background:'#8bb4d4'}}></div><div className="d-flow-line"></div></div><div className="d-flow-body"><div className="d-flow-status" style={{background:'rgba(139,180,212,0.1)',color:'#8bb4d4'}}>Pending</div><div className="d-flow-desc">Request submitted. Supplying facility notified by email. No stock reserved yet. Requesting facility can cancel at this stage.</div></div></div>
                <div className="d-flow-step"><div className="d-flow-spine"><div className="d-flow-dot" style={{background:'#19c2b5'}}></div><div className="d-flow-line"></div></div><div className="d-flow-body"><div className="d-flow-status" style={{background:'rgba(25,194,181,0.1)',color:'#19c2b5'}}>Approved</div><div className="d-flow-desc">Supplier approved and selected source batch. quantity_reserved increases on the supplying batch. Requesting facility notified. Supplier can now mark as dispatched.</div></div></div>
                <div className="d-flow-step"><div className="d-flow-spine"><div className="d-flow-dot" style={{background:'#8b5cf6'}}></div><div className="d-flow-line"></div></div><div className="d-flow-body"><div className="d-flow-status" style={{background:'rgba(139,92,246,0.1)',color:'#8b5cf6'}}>In Transit</div><div className="d-flow-desc">Stock physically dispatched. Requesting facility notified to expect delivery. Supplier can confirm fulfillment from this state.</div></div></div>
                <div className="d-flow-step"><div className="d-flow-spine"><div className="d-flow-dot" style={{background:'#22c55e'}}></div></div><div className="d-flow-body"><div className="d-flow-status" style={{background:'rgba(34,197,94,0.1)',color:'#22c55e'}}>Fulfilled</div><div className="d-flow-desc">Delivery confirmed. quantity_available and quantity_reserved both decrease on supplying batch by quantity_fulfilled. Transfer closed. Both facilities notified.</div></div></div>
              </div>
              <div className="d-note d-note-warn"><span className="d-note-icon">⚠</span><span>Transfers can also end in <strong style={{color:'#ef4444'}}>Rejected</strong> (supplier declined from Pending) or <strong style={{color:'#f5a524'}}>Cancelled</strong> (requester withdrew). In both cases quantity_reserved is released immediately via the RPC.</span></div>
            </div>

            {/* EMAIL NOTIFICATIONS */}
            <div className="d-section" id="email-notifications">
              <div className="d-section-title">Email notifications</div>
              <p className="d-section-desc">All transfer status changes and stock alerts trigger automatic emails sent via Resend from notifications@orela.africa/ng to the relevant facility's registered email address.</p>
              <div className="d-table-wrap"><table className="d-table"><thead><tr><th>Event</th><th>Recipient</th><th>Trigger</th></tr></thead><tbody>
                <tr><td>New transfer request</td><td>Supplying facility</td><td>transfer_requests INSERT (status = pending)</td></tr>
                <tr><td>Transfer approved</td><td>Requesting facility</td><td>transfer_requests UPDATE (status → approved)</td></tr>
                <tr><td>Transfer rejected</td><td>Requesting facility</td><td>transfer_requests UPDATE (status → rejected)</td></tr>
                <tr><td>Stock in transit</td><td>Requesting facility</td><td>transfer_requests UPDATE (status → in_transit)</td></tr>
                <tr><td>Transfer fulfilled</td><td>Requesting facility</td><td>transfer_requests UPDATE (status → fulfilled)</td></tr>
                <tr><td>Stock alert fired</td><td>Facility admin</td><td>stock_alerts INSERT (status = active)</td></tr>
              </tbody></table></div>
            </div>

            {/* INTELLIGENCE */}
            <div className="d-section" id="intelligence">
              <div className="d-section-title">Supply Intelligence overview</div>
              <p className="d-section-desc">The Supply Intelligence module (Analytics in the sidebar) contains six analytical modules that activate as network data accumulates. Modules are inactive for new facilities and populate automatically as inventory and transfer activity grows.</p>
              <div className="d-grid-2">
                <div className="d-card"><div className="d-card-title">Essential Medicine Coverage</div><div className="d-card-desc">Scores your facility's coverage of WHO essential medicines by therapeutic category. Activates when you have 5+ inventory items.</div></div>
                <div className="d-card"><div className="d-card-title">Emerging Shortage Signals</div><div className="d-card-desc">Tracks shortage alerts across the network over time to identify patterns. Activates with network-level data (5+ facilities).</div></div>
                <div className="d-card"><div className="d-card-title">Expiry Redistribution Forecast</div><div className="d-card-desc">Shows near-expiry stock grouped by time window (0–30d, 31–60d, 61–90d) to plan redistribution before wastage.</div></div>
                <div className="d-card"><div className="d-card-title">Transfer Fulfillment Rate</div><div className="d-card-desc">Tracks how many transfer requests are successfully fulfilled vs rejected or cancelled. Activates after first completed transfer.</div></div>
              </div>
            </div>

            {/* COVERAGE */}
            <div className="d-section" id="coverage">
              <div className="d-section-title">Medicine coverage</div>
              <p className="d-section-desc">The Essential Medicine Coverage module scores your facility against the WHO Essential Medicines List adapted for Nigeria. Coverage is calculated per therapeutic category — anti-infectives, antimalarials, analgesics, cardiovascular, antidiabetics, and others.</p>
              <div className="d-note d-note-info"><span className="d-note-icon">ℹ</span><span>Coverage scoring activates automatically when you have inventory data. No configuration required. The scoring algorithm compares your active inventory against the <span className="d-inline-code">essential_medicine</span> flag in the medicines catalog.</span></div>
            </div>

            {/* SHORTAGE SIGNALS */}
            <div className="d-section" id="shortage-signals">
              <div className="d-section-title">Shortage signals</div>
              <p className="d-section-desc">Shortage signals aggregate stock alert data across the network to identify medicines and regions where supply pressure is emerging. This module is designed for health system managers, NGOs, and distributors who need regional visibility, not just facility-level data.</p>
              <div className="d-note d-note-warn"><span className="d-note-icon">⚠</span><span>Regional shortage signals require a minimum of 5 active facilities in the same area. This module will show placeholder data until the network reaches that threshold.</span></div>
            </div>

            {/* ROLES REF */}
            <div className="d-section" id="roles">
              <div className="d-section-title">Roles &amp; permissions reference</div>
              <div className="d-table-wrap"><table className="d-table"><thead><tr><th>Action</th><th>Facility Admin</th><th>Pharmacist</th><th>Pharmacy Tech</th></tr></thead><tbody>
                <tr><td>Add inventory batch</td><td>✓</td><td>✓</td><td>—</td></tr>
                <tr><td>Adjust stock quantity</td><td>✓</td><td>✓</td><td>✓</td></tr>
                <tr><td>View inventory</td><td>✓</td><td>✓</td><td>✓</td></tr>
                <tr><td>View cost pricing</td><td>✓</td><td>—</td><td>—</td></tr>
                <tr><td>Search medicine network</td><td>✓</td><td>✓</td><td>—</td></tr>
                <tr><td>Request stock transfer</td><td>✓</td><td>✓</td><td>—</td></tr>
                <tr><td>Approve / reject transfer</td><td>✓</td><td>✓</td><td>—</td></tr>
                <tr><td>View shortage alerts</td><td>✓</td><td>✓</td><td>—</td></tr>
                <tr><td>Manage staff</td><td>✓</td><td>—</td><td>—</td></tr>
                <tr><td>Edit facility settings</td><td>✓</td><td>—</td><td>—</td></tr>
                <tr><td>Deactivate facility</td><td>✓</td><td>—</td><td>—</td></tr>
              </tbody></table></div>
            </div>

            {/* FACILITY TYPES */}
            <div className="d-section" id="facility-types">
              <div className="d-section-title">Facility types</div>
              <div className="d-table-wrap"><table className="d-table"><thead><tr><th>Type</th><th>Description</th></tr></thead><tbody>
                <tr><td>Independent Pharmacy</td><td>Retail pharmacy operating independently</td></tr>
                <tr><td>Hospital Pharmacy</td><td>Pharmacy department within a hospital</td></tr>
                <tr><td>Clinic</td><td>Outpatient clinic with dispensing capability</td></tr>
                <tr><td>Primary Health Center</td><td>Government or NGO-operated PHC</td></tr>
                <tr><td>Distributor</td><td>Pharmaceutical distributor or wholesaler</td></tr>
                <tr><td>Wholesaler</td><td>Large-scale medicine wholesaler</td></tr>
                <tr><td>NGO</td><td>Non-governmental health organization</td></tr>
                <tr><td>Government Supply</td><td>Government medical stores or supply chain entity</td></tr>
              </tbody></table></div>
            </div>

            {/* MEDICINE CATALOG */}
            <div className="d-section" id="medicine-catalog">
              <div className="d-section-title">Medicine catalog</div>
              <p className="d-section-desc">The network medicine catalog is centrally managed. Facilities cannot add their own medicines — all inventory must reference a catalog entry. This ensures consistent naming across the network and powers accurate availability search.</p>
              <div className="d-note d-note-tip"><span className="d-note-icon">💡</span><span>The catalog is drawn from the Nigeria Essential Medicines List (NEML) 8th Edition 2024, published by the Federal Ministry of Health and Social Welfare. It covers medicines across all major therapeutic categories including anti-infectives, antimalarials, analgesics, cardiovascular, antidiabetics, respiratory, reproductive health, antiretrovirals, and more. To request an addition not currently in the catalog: email <a href="mailto:hello@orela.africa" style={{color:'#19c2b5'}}>hello@orela.africa</a> with the generic name, strength, and dosage form.</span></div>
              <div className="d-table-wrap"><table className="d-table"><thead><tr><th>Medicine</th><th>Strength</th><th>Form</th><th>Essential</th></tr></thead><tbody>
                <tr><td>Amoxicillin</td><td>500mg</td><td>Capsule</td><td>✓</td></tr>
                <tr><td>Artemether/Lumefantrine</td><td>20mg/120mg</td><td>Tablet</td><td>✓</td></tr>
                <tr><td>Ibuprofen</td><td>400mg</td><td>Tablet</td><td>✓</td></tr>
                <tr><td>ORS Sachets</td><td>Standard</td><td>Sachet</td><td>✓</td></tr>
                <tr><td>Amlodipine</td><td>5mg</td><td>Tablet</td><td>✓</td></tr>
                <tr><td>Omeprazole</td><td>20mg</td><td>Capsule</td><td>✓</td></tr>
                <tr><td>Salbutamol</td><td>100mcg/dose</td><td>Inhaler</td><td>✓</td></tr>
                <tr><td>Ciprofloxacin</td><td>500mg</td><td>Tablet</td><td>✓</td></tr>
                <tr><td>Metformin</td><td>500mg</td><td>Tablet</td><td>✓</td></tr>
                <tr><td>Paracetamol</td><td>500mg</td><td>Tablet</td><td>✓</td></tr>
              </tbody></table></div>
            </div>

            {/* FAQ */}
            <div className="d-section" id="faq">
              <div className="d-section-title">Frequently asked questions</div>
              <div className="d-faq-item" id="uniqueness"><div className="d-faq-q">Is this concept unique? Does anything like this already exist?</div><div className="d-faq-a">Yes — Orela Nigeria addresses a gap that is largely unbuilt in Africa. Existing solutions fall into different categories: government supply chain software like mSupply is complex, expensive, and designed for national health ministries, not individual facilities. Expiry tracking tools like Shelf Life are single-facility with no network layer. Drone delivery platforms like Zipline focus on logistics, not coordination. Patient-facing apps focus on pricing transparency, not facility-to-facility supply. None of them build what Orela builds — a real-time availability network where facilities coordinate directly with each other to prevent stockouts. The concept of medicine supply coordination exists in developed markets through hospital supply chains and group purchasing organisations, but applying it as open network infrastructure at the facility level in Africa, where informal WhatsApp coordination is the current standard, is genuinely new.</div></div>

              <div className="d-faq-item"><div className="d-faq-q">What makes Orela Nigeria different from existing pharmacy software?</div><div className="d-faq-a">Most pharmacy software is single-facility — it helps one pharmacy manage its own inventory in isolation. Orela is network infrastructure. The value is not in managing your own stock; it is in knowing what every other verified facility near you has in stock, being able to request it, and tracking that transfer to completion. The more facilities that join, the more valuable it becomes. That network effect is what makes it structurally different from any standalone inventory tool.</div></div>

              <div className="d-faq-item"><div className="d-faq-q">Why hasn't this been built before?</div><div className="d-faq-a">The coordination problem requires trust infrastructure — facilities will only share their stock data if they trust that sensitive information (supplier details, cost pricing, reserved quantities) is protected from competitors. Building that trust layer correctly, with verified facilities, row-level data security, and structured transfer workflows, requires significant technical depth. WhatsApp groups are the current workaround because they are low-friction even if they are inefficient. Orela replaces that informal coordination with a structured, auditable, and scalable alternative.</div></div>

              <div className="d-faq-item"><div className="d-faq-q">Who are the competitors?</div><div className="d-faq-a">There are no direct competitors building facility-to-facility medicine availability networks at this level in Nigeria or West Africa. The closest adjacent players are mSupply (government-focused, complex), Shelf Life (single-facility expiry tracking), Zipline (drone logistics), and PharmAccess (patient and payment focus). None of them are building the network coordination layer that Orela focuses on.</div></div>

              <div className="d-faq-item"><div className="d-faq-q">Is Orela Nigeria free?</div><div className="d-faq-a">Yes — free for all facilities during the beta period. Any future pricing changes will be communicated with advance notice to all registered facilities.</div></div>
              <div className="d-faq-item"><div className="d-faq-q">Can other facilities see my prices or supplier details?</div><div className="d-faq-a">No. Cost pricing, supplier names, and batch-level data are protected by Row Level Security and never exposed to other facilities. The network only shares medicine name, available quantity (net of reserved), expiry date, and facility type.</div></div>
              <div className="d-faq-item"><div className="d-faq-q">What happens when a transfer is rejected or cancelled?</div><div className="d-faq-a">Any reserved stock (quantity_reserved) is immediately released back to available via the RPC. The requesting facility is notified by email and can search the network for alternative supply.</div></div>
              <div className="d-faq-item"><div className="d-faq-q">How do I get a medicine added to the catalog?</div><div className="d-faq-a">The catalog is based on the Nigeria Essential Medicines List (NEML) 8th Edition 2024. If a medicine you stock is not listed, email <a href="mailto:hello@orela.africa">hello@orela.africa</a> with the generic name, strength, and dosage form and it will be added promptly.</div></div>
              <div className="d-faq-item"><div className="d-faq-q">How does facility verification work?</div><div className="d-faq-a">Verification is currently manual. After registration, email <a href="mailto:hello@orela.africa">hello@orela.africa</a> with your registration number (PCN/NAFDAC/PPB) and facility name. Verified facilities show a green badge in network search results.</div></div>
              <div className="d-faq-item"><div className="d-faq-q">Why am I seeing the onboarding screen instead of the dashboard?</div><div className="d-faq-a">This usually means your account setup is incomplete. Email <a href="mailto:hello@orela.africa">hello@orela.africa</a> with your registered email address and we will fix it promptly.</div></div>
              <div className="d-faq-item"><div className="d-faq-q">Why can't I add stock with a near-expiry date?</div><div className="d-faq-a">This was a known issue during early beta. It has been resolved. If you encounter this, email <a href="mailto:hello@orela.africa">hello@orela.africa</a>.</div></div>
            </div>

            {/* CTA */}
            <div className="d-cta-box">
              <div className="d-cta-title">Ready to join the network?</div>
              <div className="d-cta-desc">Registration takes 5 minutes. Your inventory becomes visible to the medicine availability network immediately.</div>
              <a href="/auth" className="d-btn">Register your facility →</a>
            </div>

          </main>
        </div>
      </div>
    </>
  )
}
