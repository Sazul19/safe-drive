import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { logIn, getUserRole } from '../lib/auth'
import styles from './Auth.module.css'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await logIn(email.trim(), password)
      const role = await getUserRole(user.uid)
      if (role) {
        navigate(`/${role}`, { replace: true })
      } else {
        navigate('/auth-error', { replace: true })
      }
    } catch (err) {
      setError(
        err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found'
          ? 'Invalid email or password.'
          : err.message || 'Login failed.'
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
              <h1 className={styles.title}>Sign In</h1>
              <p className={styles.subtitle}>Emergency responder portal</p>
            </div>

            <form className={styles.form} onSubmit={handleSubmit}>
              {error && <div className={styles.error}>{error}</div>}

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
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                </div>
              </div>

              <button type="submit" className={styles.submit} disabled={loading}>
                {loading ? (
                  <>
                    <span className={styles.spinner} />
                    Signing in…
                  </>
                ) : (
                  '→ Sign In'
                )}
              </button>
            </form>

            <p className={styles.footer}>
              Don't have an account? <Link to="/signup">Create account</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
