import styles from './ImpactGauge.module.css'

/**
 * ImpactGauge – shows a horizontal G-force bar.
 * @param {number|string} gForce  – impact in G (e.g. 4.2)
 * @param {string} [severity]  – 'critical'|'high'|'medium'|'low', if known.
 *   When provided, this drives the bar's color zone instead of a fixed G
 *   threshold — impactForce is derived from the firmware's raw total
 *   magnitude (gravity included) divided by 9.81, whose actual range
 *   depends on the current crash-detection thresholds, so a fixed 3G/6G
 *   cutoff can disagree with the alert's real classification (e.g. a
 *   "critical" alert reading as green because its G value happens to be
 *   low under current thresholds). Falls back to the G-based zones below
 *   when severity isn't passed, for backward compatibility.
 */
export default function ImpactGauge({ gForce, severity }) {
  const g = parseFloat(gForce) || 0

  // Clamp to a max of 15G for display
  const MAX_G = 15
  const pct   = Math.min((g / MAX_G) * 100, 100)

  const zone = severity
    ? (severity === 'critical' ? 'high' : severity === 'high' ? 'medium' : 'low')
    // Fallback: green 0–3G, amber 3–6G, red 6G+
    : (g < 3 ? 'low' : g < 6 ? 'medium' : 'high')

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.label}>Impact Force</span>
        <span className={`${styles.value} ${styles[zone]}`}>{g} G</span>
      </div>
      <div className={styles.track}>
        <div
          className={`${styles.bar} ${styles[zone]}`}
          style={{ width: `${pct}%` }}
        />
        {/* Zone markers */}
        <div className={styles.marker} style={{ left: `${(3 / MAX_G) * 100}%` }} />
        <div className={styles.marker} style={{ left: `${(6 / MAX_G) * 100}%` }} />
      </div>
      <div className={styles.scale}>
        <span>0G</span>
        <span>3G</span>
        <span>6G</span>
        <span>15G</span>
      </div>
    </div>
  )
}
