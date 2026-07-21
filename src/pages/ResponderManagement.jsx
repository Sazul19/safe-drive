import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import DashboardLayout from '../components/DashboardLayout'
import {
  createResponderAccount,
  listResponders,
  updateResponderAccount,
  deactivateResponderAccount,
  reactivateResponderAccount,
  getResponderHistory,
} from '../lib/responders'
import dashStyles from './Dashboard.module.css'
import styles from './ResponderManagement.module.css'

const ROLE_OPTIONS = [
  { value: 'police', label: '🚔 Police' },
  { value: 'ambulance', label: '🚑 Suwa Seriya' },
]

const ACTION_LABELS = {
  created: '➕ Created',
  updated: '✏️ Updated',
  deactivated: '🚫 Deactivated',
  reactivated: '✅ Reactivated',
}

function roleLabel(role) {
  return role === 'police' ? 'Police' : 'Suwa Seriya'
}

// Admin-only account provisioning + full CRUD + history. Moved out of
// AdminDashboard into its own interface — see
// docs/features/auth-and-account-provisioning.md §4.
export default function ResponderManagement({ onLogout }) {
  const { user } = useAuth()
  const [tab, setTab] = useState('accounts') // 'accounts' | 'history'

  const [responders, setResponders] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState('police')
  const [submitting, setSubmitting] = useState(false)

  const [editingUid, setEditingUid] = useState(null)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editRole, setEditRole] = useState('police')
  const [savingEdit, setSavingEdit] = useState(false)

  const [busyUid, setBusyUid] = useState(null) // deactivate/reactivate in flight
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const loadResponders = useCallback(async () => {
    setLoadingList(true)
    try {
      const list = await listResponders()
      setResponders(list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)))
    } catch (err) {
      console.error('Failed to load responder accounts:', err)
    } finally {
      setLoadingList(false)
    }
  }, [])

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      setHistory(await getResponderHistory())
    } catch (err) {
      console.error('Failed to load responder history:', err)
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  useEffect(() => { loadResponders() }, [loadResponders])
  useEffect(() => { if (tab === 'history') loadHistory() }, [tab, loadHistory])

  const flashSuccess = (msg) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(''), 5000)
  }

  const resetCreateForm = () => {
    setEmail(''); setPassword(''); setDisplayName(''); setRole('police'); setError('')
  }

  const handleCreateSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    setSubmitting(true)
    try {
      await createResponderAccount(email.trim(), password, displayName.trim(), role)
      flashSuccess(`${roleLabel(role)} account created for ${email.trim()}`)
      resetCreateForm()
      setShowForm(false)
      await loadResponders()
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

  const startEdit = (r) => {
    setEditingUid(r.uid)
    setEditDisplayName(r.displayName || '')
    setEditRole(r.role)
    setError('')
  }

  const cancelEdit = () => {
    setEditingUid(null)
  }

  const saveEdit = async (uid) => {
    setSavingEdit(true)
    setError('')
    try {
      await updateResponderAccount(uid, { displayName: editDisplayName.trim(), role: editRole })
      flashSuccess('Account updated')
      setEditingUid(null)
      await loadResponders()
    } catch (err) {
      setError(err.message || 'Could not update account.')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDeactivate = async (r) => {
    if (!window.confirm(`Deactivate ${r.displayName || r.email}? They'll be blocked from signing back in until reactivated. If they're currently signed in, access is revoked on their next page load, not instantly.`)) return
    setBusyUid(r.uid)
    try {
      await deactivateResponderAccount(r.uid)
      flashSuccess(`${r.displayName || r.email} deactivated`)
      await loadResponders()
    } catch (err) {
      setError(err.message || 'Could not deactivate account.')
    } finally {
      setBusyUid(null)
    }
  }

  const handleReactivate = async (r) => {
    setBusyUid(r.uid)
    try {
      await reactivateResponderAccount(r.uid)
      flashSuccess(`${r.displayName || r.email} reactivated`)
      await loadResponders()
    } catch (err) {
      setError(err.message || 'Could not reactivate account.')
    } finally {
      setBusyUid(null)
    }
  }

  const policeCount = responders.filter(r => r.role === 'police').length
  const ambulanceCount = responders.filter(r => r.role === 'ambulance').length
  const activeCount = responders.filter(r => r.active !== false).length
  const deactivatedCount = responders.filter(r => r.active === false).length

  return (
    <DashboardLayout title="Manage Responders" role="admin" user={user} onLogout={onLogout}>
      <div className={dashStyles.statsBar}>
        <div className={dashStyles.statCard}>
          <span className={dashStyles.statValue}>{policeCount}</span>
          <span className={dashStyles.statLabel}>Police</span>
        </div>
        <div className={dashStyles.statCard}>
          <span className={dashStyles.statValue}>{ambulanceCount}</span>
          <span className={dashStyles.statLabel}>Suwa Seriya</span>
        </div>
        <div className={`${dashStyles.statCard} ${dashStyles.success}`}>
          <span className={dashStyles.statValue}>{activeCount}</span>
          <span className={dashStyles.statLabel}>Active</span>
        </div>
        <div className={`${dashStyles.statCard} ${dashStyles.danger}`}>
          <span className={dashStyles.statValue}>{deactivatedCount}</span>
          <span className={dashStyles.statLabel}>Deactivated</span>
        </div>
      </div>

      <div className={styles.tabs}>
        <button
          className={`${styles.tabBtn} ${tab === 'accounts' ? styles.tabBtnActive : ''}`}
          onClick={() => setTab('accounts')}
        >
          Accounts
        </button>
        <button
          className={`${styles.tabBtn} ${tab === 'history' ? styles.tabBtnActive : ''}`}
          onClick={() => setTab('history')}
        >
          History
        </button>
      </div>

      {successMsg && <div className={styles.success}>✅ {successMsg}</div>}

      {tab === 'accounts' && (
        <div className={styles.panel}>
          <div className={styles.header}>
            <div>
              <h2 className={styles.title}>👮 Responder Accounts</h2>
              <span className={styles.sub}>Only admins can create, edit, or deactivate Police / Suwa Seriya accounts</span>
            </div>
            <button className={styles.btnToggle} onClick={() => { setShowForm(s => !s); setError('') }}>
              {showForm ? 'Cancel' : '+ Add Responder'}
            </button>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          {showForm && (
            <form className={styles.form} onSubmit={handleCreateSubmit}>
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
                {submitting ? 'Creating…' : `Create ${roleLabel(role)} Account`}
              </button>
            </form>
          )}

          <div className={styles.list}>
            {loadingList ? (
              <p className={styles.empty}>Loading…</p>
            ) : responders.length === 0 ? (
              <p className={styles.empty}>No Police/Suwa Seriya accounts yet.</p>
            ) : (
              responders.map(r => {
                const isEditing = editingUid === r.uid
                const isDeactivated = r.active === false
                const isBusy = busyUid === r.uid

                if (isEditing) {
                  return (
                    <div key={r.uid} className={`${styles.row} ${styles.rowEditing}`}>
                      <div className={styles.editForm}>
                        <div className={styles.roleGroup}>
                          {ROLE_OPTIONS.map(opt => (
                            <label key={opt.value} className={`${styles.roleOption} ${editRole === opt.value ? styles.roleOptionActive : ''}`}>
                              <input
                                type="radio"
                                name={`editRole-${r.uid}`}
                                checked={editRole === opt.value}
                                onChange={() => setEditRole(opt.value)}
                              />
                              {opt.label}
                            </label>
                          ))}
                        </div>
                        <input
                          type="text"
                          className={styles.input}
                          placeholder="Full name"
                          value={editDisplayName}
                          onChange={e => setEditDisplayName(e.target.value)}
                        />
                        <span className={styles.rowEmail}>{r.email} (email cannot be changed here)</span>
                        <div className={styles.editActions}>
                          <button className={styles.btnSubmit} onClick={() => saveEdit(r.uid)} disabled={savingEdit}>
                            {savingEdit ? 'Saving…' : 'Save'}
                          </button>
                          <button className={styles.btnToggle} onClick={cancelEdit} disabled={savingEdit}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={r.uid} className={`${styles.row} ${isDeactivated ? styles.rowInactive : ''}`}>
                    <span className={styles.roleBadge} data-role={r.role}>
                      {r.role === 'police' ? '🚔 Police' : '🚑 Suwa Seriya'}
                    </span>
                    <div className={styles.rowInfo}>
                      <span className={styles.rowName}>
                        {r.displayName || '(no name)'}
                        {isDeactivated && <span className={styles.statusBadge}>Deactivated</span>}
                      </span>
                      <span className={styles.rowEmail}>{r.email}</span>
                    </div>
                    <span className={styles.rowDate}>
                      {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}
                    </span>
                    <div className={styles.rowActions}>
                      <button className={styles.btnGhost} onClick={() => startEdit(r)} disabled={isBusy}>
                        ✏️ Edit
                      </button>
                      {isDeactivated ? (
                        <button className={styles.btnGhost} onClick={() => handleReactivate(r)} disabled={isBusy}>
                          {isBusy ? '…' : '✅ Reactivate'}
                        </button>
                      ) : (
                        <button className={styles.btnGhostDanger} onClick={() => handleDeactivate(r)} disabled={isBusy}>
                          {isBusy ? '…' : '🚫 Deactivate'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className={styles.panel}>
          <div className={styles.header}>
            <div>
              <h2 className={styles.title}>🕒 Responder Activity History</h2>
              <span className={styles.sub}>Every create / update / deactivate / reactivate action, newest first</span>
            </div>
          </div>

          <div className={styles.list}>
            {loadingHistory ? (
              <p className={styles.empty}>Loading…</p>
            ) : history.length === 0 ? (
              <p className={styles.empty}>No responder activity recorded yet.</p>
            ) : (
              history.map(h => (
                <div key={h.id} className={styles.historyRow}>
                  <span className={styles.historyAction}>{ACTION_LABELS[h.action] || h.action}</span>
                  <div className={styles.rowInfo}>
                    <span className={styles.rowName}>{h.targetEmail || h.targetUid}</span>
                    <span className={styles.rowEmail}>
                      by {h.performedByEmail || h.performedBy}
                      {h.details && Object.keys(h.details).length > 0 && (
                        <> · {Object.entries(h.details).map(([k, v]) => `${k}: ${v}`).join(', ')}</>
                      )}
                    </span>
                  </div>
                  <span className={styles.rowDate}>
                    {h.timestamp ? new Date(h.timestamp).toLocaleString() : ''}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
