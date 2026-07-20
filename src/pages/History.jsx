import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { subscribeAlerts } from '../lib/alerts'
import { useAuth } from '../contexts/AuthContext'
import DashboardLayout from '../components/DashboardLayout'
import styles from './History.module.css'
import { logOut } from '../lib/auth'

// ── CSV export helper ───────────────────────────────────────────────────────
function exportCSV(alerts, role) {
  const headers = ['Date & Time', 'Incident Source', 'Accident Type', 'Severity', 'Location', 'Impact Force (G)', 'Speed (km/h)']
  if (role !== 'ambulance') headers.push('Police Status')
  if (role !== 'police') headers.push('Ambulance Status')

  const rows = alerts.map(a => {
    const row = [
      new Date(a.createdAt).toLocaleString('en-GB'),
      a.vehicleId || '',
      a.accidentType || '',
      a.severity || '',
      `"${(a.address || '').replace(/"/g, '""')}"`,
      a.impactForce || '',
      a.speed || '',
    ]
    if (role !== 'ambulance') row.push(a.policeStatus || '')
    if (role !== 'police') row.push(a.ambulanceStatus || '')
    return row
  })
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href     = url
  link.download = `incident-history-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function History() {
  const { user, role } = useAuth()
  const [alerts, setAlerts]       = useState([])
  const [search, setSearch]       = useState('')
  const [severity, setSeverity]   = useState('')
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')

  useEffect(() => {
    return subscribeAlerts(setAlerts)
  }, [])

  // Apply all filters
  const filteredAlerts = alerts.filter(a => {
    const textMatch =
      (a.vehicleId || '').toLowerCase().includes(search.toLowerCase()) ||
      (a.address || '').toLowerCase().includes(search.toLowerCase())

    const severityMatch = !severity || a.severity === severity

    const fromMs = dateFrom ? new Date(dateFrom).getTime() : 0
    const toMs   = dateTo   ? new Date(dateTo + 'T23:59:59').getTime() : Infinity
    const dateMatch = a.createdAt >= fromMs && a.createdAt <= toMs

    return textMatch && severityMatch && dateMatch
  })

  const stats = {
    total:    alerts.length,
    resolved: alerts.filter(a => a.policeStatus === 'arrived' && a.ambulanceStatus === 'arrived').length,
    pending:  alerts.filter(a => a.policeStatus === 'pending' || a.ambulanceStatus === 'pending').length,
  }

  const anyFilter = search || severity || dateFrom || dateTo
  const clearFilters = () => { setSearch(''); setSeverity(''); setDateFrom(''); setDateTo('') }

  const handleLogout = () => logOut()

  return (
    <DashboardLayout
      title="Incident History"
      role={role}
      user={user}
      onLogout={handleLogout}
    >
      <div className={styles.pageContainer}>
        {/* Back Button */}
        <div style={{ marginBottom: '1.25rem' }}>
          <Link to="/" className={styles.backBtn}>
            ← Back to Active Dashboard
          </Link>
        </div>

        {/* Stats */}
        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Total Incidents</span>
            <span className={styles.statValue}>{stats.total}</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Fully Resolved</span>
            <span className={styles.statValue} style={{ color: 'var(--green)' }}>{stats.resolved}</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Active / Pending</span>
            <span className={styles.statValue} style={{ color: 'var(--red)' }}>{stats.pending}</span>
          </div>
        </div>

        {/* Filter bar */}
        <div className={styles.filterBar}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="🔍 Search by source or location…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          <select
            className={styles.filterSelect}
            value={severity}
            onChange={e => setSeverity(e.target.value)}
          >
            <option value="">All Severities</option>
            <option value="critical">🔴 Critical</option>
            <option value="high">🟠 High</option>
            <option value="medium">🟡 Medium</option>
            <option value="low">🟢 Low</option>
          </select>

          <div className={styles.dateGroup}>
            <input
              type="date"
              className={styles.dateInput}
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              title="From date"
            />
            <span className={styles.dateSep}>→</span>
            <input
              type="date"
              className={styles.dateInput}
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              title="To date"
            />
          </div>

          {anyFilter && (
            <button className={styles.clearBtn} onClick={clearFilters}>✕ Clear</button>
          )}

          <button
            className={styles.exportBtn}
            onClick={() => exportCSV(filteredAlerts, role)}
            disabled={filteredAlerts.length === 0}
            title="Export as CSV spreadsheet"
          >
            📥 Export CSV
          </button>

          <span className={styles.resultCount}>
            {filteredAlerts.length === alerts.length
              ? `${alerts.length} records`
              : `${filteredAlerts.length} of ${alerts.length}`}
          </span>
        </div>

        {/* Table */}
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Date &amp; Time</th>
                <th className={styles.th}>Incident Source</th>
                <th className={styles.th}>Accident Type</th>
                <th className={styles.th}>Severity</th>
                <th className={styles.th}>Location</th>
                <th className={styles.th}>Impact</th>
                <th className={styles.th}>Response Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredAlerts.map(a => (
                <tr key={a.id} className={styles.tr}>
                  <td className={styles.td}>
                    {new Date(a.createdAt).toLocaleString('en-GB', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                    })}
                  </td>
                  <td className={styles.td}>
                    <span className={styles.vehicleId}>IoT Smart Car</span>
                  </td>
                  <td className={styles.td}>
                    <span className={styles.accType}>{a.accidentType || '—'}</span>
                  </td>
                  <td className={styles.td}>
                    <span className={`${styles.severityBadge} ${styles[a.severity]}`}>
                      {a.severity === 'critical' ? '🔴 Critical'
                        : a.severity === 'high' ? '🟠 High'
                        : a.severity === 'medium' ? '🟡 Medium'
                        : a.severity === 'low' ? '🟢 Low' : '—'}
                    </span>
                  </td>
                  <td className={styles.td}>{a.address}</td>
                  <td className={styles.td}>
                    {a.impactForce ? (
                      <span className={styles.impactPill}>
                        {a.impactForce} G
                      </span>
                    ) : '—'}
                  </td>
                  <td className={styles.td}>
                    <div className={styles.statusGroup}>
                      {role !== 'ambulance' && (
                        <div className={styles.status}>
                          <div className={`${styles.dot} ${styles[a.policeStatus]}`} />
                          🚔 Police: {a.policeStatus.replace('_', ' ')}
                        </div>
                      )}
                      {role !== 'police' && (
                        <div className={styles.status}>
                          <div className={`${styles.dot} ${styles[a.ambulanceStatus]}`} />
                          🚑 Ambulance: {a.ambulanceStatus.replace('_', ' ')}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredAlerts.length === 0 && (
                <tr>
                  <td colSpan="7" className={styles.td} style={{ textAlign: 'center', padding: '3rem' }}>
                    {alerts.length === 0 ? 'No incident records found.' : 'No records match the current filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  )
}
