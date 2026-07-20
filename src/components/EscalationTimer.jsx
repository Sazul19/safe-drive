import { useState, useEffect } from 'react'
import styles from './EscalationTimer.module.css'

const MINOR_WINDOW_MS = 3 * 60 * 1000   // 3 minutes

/**
 * EscalationTimer – shows a countdown bar for minor accident alerts.
 * When the 3-minute window expires, shows "Escalated to Emergency".
 * @param {number} createdAt  – alert.createdAt timestamp (ms)
 * @param {string} accidentType – used to detect if it's a minor collision
 */
export default function EscalationTimer({ createdAt, accidentType }) {
  const isMinor = accidentType?.toLowerCase().includes('minor')
  const [remaining, setRemaining] = useState(0)
  const [pct, setPct] = useState(100)

  useEffect(() => {
    if (!isMinor) return

    const tick = () => {
      const elapsed = Date.now() - createdAt
      const left    = Math.max(0, MINOR_WINDOW_MS - elapsed)
      setRemaining(left)
      setPct((left / MINOR_WINDOW_MS) * 100)
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [createdAt, isMinor])

  if (!isMinor) return null

  const minutes = Math.floor(remaining / 60000)
  const seconds = Math.floor((remaining % 60000) / 1000)
  const escalated = remaining === 0

  return (
    <div className={`${styles.wrap} ${escalated ? styles.escalated : ''}`}>
      <div className={styles.header}>
        <span className={styles.label}>
          {escalated ? '🚨 Escalated to Emergency' : '⏳ Minor Alert – Auto-escalation in'}
        </span>
        {!escalated && (
          <span className={styles.countdown}>
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </span>
        )}
      </div>
      <div className={styles.track}>
        <div
          className={`${styles.bar} ${escalated ? styles.done : pct < 30 ? styles.urgent : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {escalated && (
        <p className={styles.note}>Driver did not cancel — alert sent to emergency services</p>
      )}
    </div>
  )
}
