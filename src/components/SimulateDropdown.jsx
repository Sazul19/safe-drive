import styles from './DashboardLayout.module.css'

// Single item rendered inside the profile dropdown menu (see
// DashboardLayout's profileMenuExtra slot). Purely presentational — the
// actual tracking state/interval lives in useSimulateTracking(), owned by
// the dashboard page itself, so it keeps running even while this menu is
// closed (its contents unmount each time the dropdown toggles).
export default function SimulateDropdown({ status, secondsLeft, onStart, onStop }) {
  if (status === 'running') {
    return (
      <button className={styles.dropdownItem} onClick={onStop}>
        <span className={styles.itemIcon}>⏹</span>
        Stop simulation ({secondsLeft}s left)
      </button>
    )
  }

  return (
    <button className={styles.dropdownItem} onClick={onStart}>
      <span className={styles.itemIcon}>🧭</span>
      {status === 'done' ? 'Simulate again: Malabe → CINEC' : 'Simulate: Malabe → CINEC'}
    </button>
  )
}
