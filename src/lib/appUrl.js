// App origin for cross-domain links from public/marketing pages.
//
// Set VITE_APP_URL=https://app.orela.africa in Vercel environment variables
// once the subdomain is configured and DNS has propagated.
//
// Until then this falls back to the current window origin + the /ng/ base
// path so links work correctly on the existing orela.africa deployment.
const configured = import.meta.env.VITE_APP_URL

const APP_URL = configured
  ? configured.replace(/\/$/, '')
  : (typeof window !== 'undefined' ? window.location.origin + '/ng' : 'https://orela.africa/ng')

export function appUrl(path) {
  return APP_URL + path
}

// True when running on the authenticated app subdomain.
// Used to set basename="/" and redirect / → /auth instead of showing LandingPage.
export const IS_APP_HOST =
  typeof window !== 'undefined' && window.location.hostname === 'app.orela.africa'
