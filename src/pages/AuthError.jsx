import { logOut } from '../lib/auth'
import styles from './AuthError.module.css'

export default function AuthError() {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.icon}>⚠️</div>
        <h1 className={styles.title}>Could not load your account</h1>
        <p className={styles.text}>
          Your profile could not be loaded from the database. This usually means
          <strong> Realtime Database rules</strong> are not set correctly (use Realtime Database, not Firestore).
        </p>
        <p className={styles.text}>
          In Firebase Console: <strong>Build → Realtime Database → Rules</strong>, then paste the rules from <code>database.rules.json</code> and publish.
        </p>
        <button className={styles.button} onClick={() => logOut()}>
          Sign out
        </button>
      </div>
    </div>
  )
}
