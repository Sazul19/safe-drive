import { useAuth } from '../contexts/AuthContext'
import { logOut } from '../lib/auth'

// Shown instead of the normal dashboard when a Police/Ambulance account has
// been deactivated by an admin (users/{uid}/active === false). See
// lib/responders.js and docs/features/auth-and-account-provisioning.md §4.4 —
// this is the enforcement point that makes deactivation a real access
// control, not just a cosmetic flag.
export default function AccountDeactivated() {
  const { user } = useAuth()

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '16px',
      padding: '24px', textAlign: 'center', background: 'var(--bg)', color: 'var(--text-primary)',
    }}>
      <div style={{ fontSize: '3rem' }}>🚫</div>
      <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Account Deactivated</h1>
      <p style={{ margin: 0, color: 'var(--text-muted)', maxWidth: '360px' }}>
        {user?.email ? `The account ${user.email} has` : 'This account has'} been deactivated by an administrator.
        Contact your administrator if you believe this is a mistake.
      </p>
      <button
        onClick={() => logOut()}
        style={{
          marginTop: '8px', padding: '10px 24px', borderRadius: '8px', border: 'none',
          background: 'var(--blue)', color: '#fff', fontWeight: 700, cursor: 'pointer',
        }}
      >
        Sign out
      </button>
    </div>
  )
}
