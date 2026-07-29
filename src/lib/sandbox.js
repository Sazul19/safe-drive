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
