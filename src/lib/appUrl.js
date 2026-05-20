// True when running on the authenticated app subdomain.
// Used to set basename="/" and redirect / → /auth instead of showing LandingPage.
export const IS_APP_HOST =
  typeof window !== 'undefined' && window.location.hostname === 'app.orela.africa'

// Authenticated app origin — used for links into the dashboard from public pages.
// Set VITE_APP_URL=https://app.orela.africa in Vercel env vars.
// Fallback: app.orela.africa → current origin (no /ng prefix, basename="/")
//           orela.africa     → current origin + /ng  (basename="/ng")
const configured = import.meta.env.VITE_APP_URL

const APP_URL = configured
  ? configured.replace(/\/$/, '')
  : typeof window !== 'undefined'
    ? IS_APP_HOST ? window.location.origin : window.location.origin + '/ng'
    : 'https://orela.africa/ng'

export function appUrl(path) {
  return APP_URL + path
}

// Public Nigeria network origin — for cross-domain links from the app back to
// the public-facing pages (e.g. medicine-alerts bulletin).
export const PUBLIC_NG_URL = 'https://orela.africa/ng'
