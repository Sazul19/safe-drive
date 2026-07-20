import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { setUserRole } from '../lib/auth'
import styles from './SetRole.module.css'

// Recovery screen for a signed-in account with no role record yet (e.g. the
// signUp() write failed). Deliberately offers only "Continue as Driver" —
// Admin/Police/Ambulance can never be self-assigned here. This used to let
// anyone pick any role including Admin, which was a privilege-escalation
// hole; see docs/features/auth-and-account-provisioning.md.
export default function SetRole() {
  const { user, setRoleFromProfile } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleContinueAsDriver() {
    if (!user) return
    setError('')
    setLoading(true)
    try {
      await setUserRole(user.uid, user.email || '')
    } catch (err) {
      setError('Could not save to database (using this device only).')
    }
    setRoleFromProfile('user')
    setLoading(false)
    navigate('/user', { replace: true })
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Finish setting up your account</h1>
        <p className={styles.subtitle}>
          We couldn't find a role for this account.
        </p>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.buttons}>
          <button
            className={styles.btn}
            onClick={handleContinueAsDriver}
            disabled={loading}
          >
            <span>{loading ? 'Setting up…' : 'Continue as Driver'}</span>
          </button>
        </div>
        <p className={styles.hint}>
          Police / Suwa Seriya / Admin accounts are provisioned by an administrator — contact yours if you're expecting one of those instead.
        </p>
      </div>
    </div>
  )
}
