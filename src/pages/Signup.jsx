import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signUp } from '../lib/auth'
import styles from './Auth.module.css'

// Public self-signup is driver-only — Police/Ambulance accounts are
// provisioned by an admin from the Admin Dashboard (see
// docs/features/auth-and-account-provisioning.md), so there's no role
// picker here anymore.
export default function Signup() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    setLoading(true)
    try {
      await signUp(email.trim(), password, displayName.trim())
      navigate('/user', { replace: true })
    } catch (err) {
      setError(
        err.code === 'auth/email-already-in-use'
          ? 'This email is already registered.'
          : err.message || 'Sign up failed.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.authContainer}>
        {/* Single Unified Multi-Panel Card */}
        <div className={styles.card}>
          {/* Left Column: Visual Side Panel */}
          <div className={styles.visualCol}>
            <div className={styles.visualOverlay} />
            <div className={styles.visualContent}>
              <span className={styles.visualTag}>🚨 SECONDS SAVE LIVES</span>
              <h2 className={styles.visualTitle}>Smart Emergency Network</h2>
              <p className={styles.visualText}>
                Connecting ESP32 vehicle impact sensors with police traffic units and Suwa Seriya ambulances in real time.
              </p>
            </div>
          </div>

          {/* Right Column: Form */}
          <div className={styles.formCol}>
            {/* Brand */}
            <div className={styles.brand}>
              <div className={styles.brandIcon}>🚨</div>
              <span className={styles.brandName}>Smart Vehicle Alert System</span>
              <h1 className={styles.title}>Create Account</h1>
              <p className={styles.subtitle}>Register as a driver</p>
            </div>

            <form className={styles.form} onSubmit={handleSubmit}>
              {error && <div className={styles.error}>{error}</div>}

              <div className={styles.fieldGroup}>
                <label className={styles.label}>Full name</label>
                <div className={styles.inputWrapper}>
                  <span className={styles.inputIcon}>👤</span>
                  <input
                    type="text"
                    className={`${styles.input} ${styles.inputWithIcon}`}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                    autoComplete="name"
                  />
                </div>
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.label}>Email address</label>
                <div className={styles.inputWrapper}>
                  <span className={styles.inputIcon}>✉️</span>
                  <input
                    type="email"
                    className={`${styles.input} ${styles.inputWithIcon}`}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.label}>Password</label>
                <div className={styles.inputWrapper}>
                  <span className={styles.inputIcon}>🔒</span>
                  <input
                    type="password"
                    className={`${styles.input} ${styles.inputWithIcon}`}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.label}>Confirm password</label>
                <div className={styles.inputWrapper}>
                  <span className={styles.inputIcon}>🔒</span>
                  <input
                    type="password"
                    className={`${styles.input} ${styles.inputWithIcon}`}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>

              {/* No role picker here — public self-signup is driver-only.
                  Police/Ambulance accounts are created by an admin from the
                  Admin Dashboard (see docs/features/auth-and-account-provisioning.md).
                  A role selector was briefly reintroduced here during a UI
                  redesign merge and removed again — do not re-add one. */}
              <p className={styles.footer} style={{ margin: '-4px 0 4px', fontSize: '0.82rem' }}>
                Police / Suwa Seriya accounts are created by an administrator, not through this form.
              </p>

              <button type="submit" className={styles.submit} disabled={loading}>
                {loading ? (
                  <>
                    <span className={styles.spinner} />
                    Creating account…
                  </>
                ) : (
                  '→ Create Account'
                )}
              </button>
            </form>

            <p className={styles.footer}>
              Already have an account? <Link to="/login">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
