import styles from './ImpactGauge.module.css'

/**
 * ImpactGauge – shows a horizontal G-force bar.
 * @param {number|string} gForce  – impact in G (e.g. 4.2)
 */
export default function ImpactGauge({ gForce }) {
  const g = parseFloat(gForce) || 0

  // Clamp to a max of 15G for display
  const MAX_G = 15
  const pct   = Math.min((g / MAX_G) * 100, 100)

  // Color zones: green 0–3G, amber 3–6G, red 6G+
  const zone =
    g < 3 ? 'low'
    : g < 6 ? 'medium'
    : 'high'

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
