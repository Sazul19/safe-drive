import styles from './AnalyticsPanel.module.css'

// ── Donut Chart ──────────────────────────────────────────────────────────────
function DonutChart({ data }) {
  const total   = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return <div className={styles.noData}>No data yet</div>

  const R = 50, CX = 60, CY = 60, STROKE = 16
  const circumference = 2 * Math.PI * R

  let offset = 0
  const slices = data.map(d => {
    const pct   = d.value / total
    const dash  = pct * circumference
    const slice = { ...d, dash, offset: circumference - offset }
    offset += dash
    return slice
  })

  return (
    <div className={styles.donutWrap}>
      <svg viewBox="0 0 120 120" className={styles.donutSvg}>
        {slices.map((s, i) => (
          <circle
            key={i}
            cx={CX} cy={CY} r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={STROKE}
            strokeDasharray={`${s.dash} ${circumference - s.dash}`}
            strokeDashoffset={s.offset}
            strokeLinecap="butt"
            className={styles.donutSlice}
          />
        ))}
        <text x={CX} y={CY - 6} textAnchor="middle" className={styles.donutTotal}>{total}</text>
        <text x={CX} y={CY + 10} textAnchor="middle" className={styles.donutLabel}>Alerts</text>
      </svg>

      <div className={styles.legend}>
        {data.map((d, i) => (
          <div key={i} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: d.color }} />
            <span className={styles.legendName}>{d.name}</span>
            <span className={styles.legendVal}>{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Bar Chart ────────────────────────────────────────────────────────────────
function BarChart({ data }) {
  const maxVal = Math.max(...data.map(d => d.value), 1)
  return (
    <div className={styles.barChart}>
      {data.map((d, i) => (
        <div key={i} className={styles.barRow}>
          <span className={styles.barLabel}>{d.name}</span>
          <div className={styles.barTrack}>
            <div
              className={styles.barFill}
              style={{ width: `${(d.value / maxVal) * 100}%` }}
            />
          </div>
          <span className={styles.barVal}>{d.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main Panel ───────────────────────────────────────────────────────────────
export default function AnalyticsPanel({ alerts }) {
  // Severity distribution
  const severityData = [
    { name: 'Critical', value: alerts.filter(a => a.severity === 'critical').length, color: '#ef4444' },
    { name: 'High',     value: alerts.filter(a => a.severity === 'high').length,     color: '#f97316' },
    { name: 'Medium',   value: alerts.filter(a => a.severity === 'medium').length,   color: '#f59e0b' },
    { name: 'Low',      value: alerts.filter(a => a.severity === 'low').length,      color: '#22c55e' },
  ]

  // Accident type frequency
  const typeMap = {}
  alerts.forEach(a => {
    if (a.accidentType) typeMap[a.accidentType] = (typeMap[a.accidentType] || 0) + 1
  })
  const typeData = Object.entries(typeMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  // Fully resolved = both responders arrived — matches the main stat bar's
  // "Case Closed" definition so the two panels never disagree on this number.
  const resolvedCount = alerts.filter(a => a.policeStatus === 'arrived' && a.ambulanceStatus === 'arrived').length
  const resolutionRate = alerts.length > 0 ? Math.round((resolvedCount / alerts.length) * 100) : 0

  // Average time-to-first-response: createdAt -> earliest of policeStatusAt/
  // ambulanceStatusAt among alerts that have at least one real transition
  // timestamp (older alerts written before this field existed are skipped).
  const responseTimes = alerts
    .map(a => {
      const times = [a.policeStatusAt, a.ambulanceStatusAt].filter(Boolean)
      if (times.length === 0) return null
      return Math.min(...times) - a.createdAt
    })
    .filter(t => t !== null && t >= 0)

  const avgResponseMs = responseTimes.length > 0
    ? responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length
    : null

  const formatDuration = (ms) => {
    if (ms === null) return '—'
    const totalSec = Math.round(ms / 1000)
    const mins = Math.floor(totalSec / 60)
    const secs = totalSec % 60
    return `${mins}m ${secs}s`
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>📊 Incident Analytics</h2>
        <span className={styles.panelSub}>Live summary based on all recorded alerts</span>
      </div>

      <div className={styles.grid}>
        {/* Donut */}
        <div className={styles.chartCard}>
          <div className={styles.chartTitle}>Severity Distribution</div>
          <DonutChart data={severityData} />
        </div>

        {/* Accident types */}
        <div className={styles.chartCard}>
          <div className={styles.chartTitle}>Accident Type Frequency</div>
          {typeData.length > 0
            ? <BarChart data={typeData} />
            : <div className={styles.noData}>No data yet</div>
          }
        </div>

        {/* Resolution rate */}
        <div className={styles.chartCard}>
          <div className={styles.chartTitle}>Response Overview</div>
          <div className={styles.statGrid}>
            <div className={styles.bigStat}>
              <span className={styles.bigVal} style={{ color: 'var(--green)' }}>{resolutionRate}%</span>
              <span className={styles.bigLabel}>Cases Closed</span>
            </div>
            <div className={styles.bigStat}>
              <span className={styles.bigVal} style={{ color: 'var(--red)' }}>
                {alerts.filter(a => a.policeStatus === 'pending' && a.ambulanceStatus === 'pending').length}
              </span>
              <span className={styles.bigLabel}>Awaiting Response</span>
            </div>
            <div className={styles.bigStat}>
              <span className={styles.bigVal} style={{ color: 'var(--amber)' }}>
                {alerts.filter(a => a.policeStatus === 'en_route' || a.ambulanceStatus === 'en_route').length}
              </span>
              <span className={styles.bigLabel}>Units En Route</span>
            </div>
            <div className={styles.bigStat}>
              <span className={styles.bigVal}>{alerts.length}</span>
              <span className={styles.bigLabel}>Total Incidents</span>
            </div>
            <div className={styles.bigStat}>
              <span className={styles.bigVal}>{formatDuration(avgResponseMs)}</span>
              <span className={styles.bigLabel}>Avg. Time to First Response</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
