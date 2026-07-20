import { useState, useEffect, useCallback } from 'react'
import { createResponderAccount, listAllUsers } from '../lib/auth'
import styles from './ManageResponders.module.css'

const ROLE_OPTIONS = [
  { value: 'police', label: '🚔 Police' },
  { value: 'ambulance', label: '🚑 Suwa Seriya' },
]

// Admin-only account provisioning. Police/Ambulance accounts can no longer
// be created via public self-signup (see docs/features/auth-and-account-provisioning.md)
// — this is now the only way to create them.
export default function ManageResponders() {
  const [responders, setResponders] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState('police')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const loadResponders = useCallback(async () => {
    setLoadingList(true)
    try {
      const all = await listAllUsers()
      setResponders(all.filter(u => u.role === 'police' || u.role === 'ambulance'))
    } catch (err) {
      console.error('Failed to load responder accounts:', err)
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => { loadResponders() }, [loadResponders])

  const resetForm = () => {
    setEmail(''); setPassword(''); setDisplayName(''); setRole('police'); setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    setSubmitting(true)
    try {
      await createResponderAccount(email.trim(), password, displayName.trim(), role)
      setSuccessMsg(`${role === 'police' ? 'Police' : 'Suwa Seriya'} account created for ${email.trim()}`)
      resetForm()
      setShowForm(false)
      await loadResponders()
      setTimeout(() => setSuccessMsg(''), 5000)
    } catch (err) {
      setError(
        err.code === 'auth/email-already-in-use'
          ? 'This email is already registered.'
          : err.message || 'Could not create account.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>👮 Manage Responder Accounts</h2>
          <span className={styles.sub}>Only admins can create Police / Suwa Seriya accounts</span>
        </div>
        <button className={styles.btnToggle} onClick={() => { setShowForm(s => !s); setError('') }}>
          {showForm ? 'Cancel' : '+ Add Responder'}
        </button>
      </div>

      {successMsg && <div className={styles.success}>✅ {successMsg}</div>}

      {showForm && (
        <form className={styles.form} onSubmit={handleSubmit}>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.roleGroup}>
            {ROLE_OPTIONS.map(r => (
              <label key={r.value} className={`${styles.roleOption} ${role === r.value ? styles.roleOptionActive : ''}`}>
                <input
                  type="radio"
                  name="responderRole"
                  value={r.value}
                  checked={role === r.value}
                  onChange={() => setRole(r.value)}
                />
                {r.label}
              </label>
            ))}
          </div>

          <div className={styles.fieldRow}>
            <input
              type="text"
              className={styles.input}
              placeholder="Full name"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
            />
            <input
              type="email"
              className={styles.input}
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              className={styles.input}
              placeholder="Temporary password (6+ chars)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className={styles.btnSubmit} disabled={submitting}>
            {submitting ? 'Creating…' : `Create ${role === 'police' ? 'Police' : 'Suwa Seriya'} Account`}
          </button>
        </form>
      )}

      <div className={styles.list}>
        {loadingList ? (
          <p className={styles.empty}>Loading…</p>
        ) : responders.length === 0 ? (
          <p className={styles.empty}>No Police/Suwa Seriya accounts yet.</p>
        ) : (
          responders
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .map(r => (
              <div key={r.uid} className={styles.row}>
                <span className={styles.roleBadge} data-role={r.role}>
                  {r.role === 'police' ? '🚔 Police' : '🚑 Suwa Seriya'}
                </span>
                <div className={styles.rowInfo}>
                  <span className={styles.rowName}>{r.displayName || '(no name)'}</span>
                  <span className={styles.rowEmail}>{r.email}</span>
                </div>
                <span className={styles.rowDate}>
                  {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}
                </span>
              </div>
            ))
        )}
      </div>
    </div>
  )
}
