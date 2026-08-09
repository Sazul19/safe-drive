// Sandbox mode is normally set at build time via VITE_ENABLE_SANDBOX, which
// requires a rebuild/redeploy to toggle on a live site. This adds a runtime
// override (persisted in localStorage) so it can be flipped on directly from
// the browser — e.g. on a deployed site where redeploying just to test isn't
// practical. Build-time flag still works and takes priority if set.
const STORAGE_KEY = 'safedrive_sandbox_enabled'

export function isSandboxEnabled() {
  if (import.meta.env.VITE_ENABLE_SANDBOX === 'true') return true
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
}

export function setSandboxEnabled(value) {
  try { localStorage.setItem(STORAGE_KEY, value ? '1' : '0') } catch {}
}

// Separate opt-in toggle for Police/Ambulance route-tracking: when off (the
// default), a unit only moves from genuine device GPS — no fallback fake
// movement at all. When explicitly turned on via a discreet UI control, it
// walks a fixed route (see PoliceDashboard.jsx/AmbulanceDashboard.jsx) along
// real road geometry whenever real GPS isn't available, so tracking still
// looks live during a demo without ever being on by default.
const ROUTE_SIM_KEY = 'safedrive_route_sim_enabled'

export function isRouteSimEnabled() {
  try { return localStorage.getItem(ROUTE_SIM_KEY) === '1' } catch { return false }
}

export function setRouteSimEnabled(value) {
  try { localStorage.setItem(ROUTE_SIM_KEY, value ? '1' : '0') } catch {}
}
