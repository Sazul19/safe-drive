import { useState, useEffect, useRef, memo } from 'react'
import { Link } from 'react-router-dom'
import { subscribeAlerts, deleteAlert, updateAlertStatus, SEVERITY_LABELS } from '../lib/alerts'
import { useAuth } from '../contexts/AuthContext'
import DashboardLayout from '../components/DashboardLayout'
import StatusBadge from '../components/StatusBadge'
import ImpactGauge from '../components/ImpactGauge'
import EscalationTimer from '../components/EscalationTimer'
import StatusTimeline from '../components/StatusTimeline'
import AlertFilters, { applyFilters } from '../components/AlertFilters'
import { requestNotificationPermission, showAlertNotification, playAlertSound } from '../lib/notifications'
import styles from './Dashboard.module.css'

// ── Live elapsed time hook ──
function useElapsed(createdAt) {
  const [elapsed, setElapsed] = useState('')
  useEffect(() => {
    const tick = () => {
      const time = typeof createdAt === 'number' ? createdAt : new Date(createdAt).getTime() || 0
      const secs = Math.floor((Date.now() - time) / 1000)
      if (secs < 60)        setElapsed(`${secs}s ago`)
      else if (secs < 3600) setElapsed(`${Math.floor(secs / 60)}m ago`)
      else                  setElapsed(`${Math.floor(secs / 3600)}h ago`)
    }
    tick()
    const id = setInterval(tick, 10000)
    return () => clearInterval(id)
  }, [createdAt])
  return elapsed
}

// ── Alerts Page Card Component ──
const AlertCard = memo(function AlertCard({ a, index, role, onStatusChange }) {
  const elapsed = useElapsed(a.createdAt)
  const showDelete = role === 'admin'
  const showResponderActions = role === 'police' || role === 'ambulance'

  const getActiveStatus = () => {
    return role === 'police' ? a.policeStatus : a.ambulanceStatus
  }

  return (
    <div className={`${styles.card} ${a.severity ? styles[a.severity] : ''}`}>
      <div className={styles.cardTop}>
        <span className={styles.vehicle}>🚗 Smart Vehicle Alert</span>
        <div className={styles.cardMeta}>
          {index === 0 && <span className={styles.newBadge}>● New</span>}
          <span className={styles.elapsed}>⏱ {elapsed}</span>
          <StatusBadge status={role === 'police' ? a.policeStatus : role === 'ambulance' ? a.ambulanceStatus : 'pending'} />
        </div>
      </div>

      {a.accidentType && (
        <div className={styles.accidentRow}>
          <span className={styles.accidentType}>💥 {a.accidentType}</span>
          {a.speed && <span className={styles.metaPill}>⚡ {a.speed} km/h</span>}
          {a.severity && <span className={styles.metaPill}>{SEVERITY_LABELS[a.severity]}</span>}
          {a.impactForce && <span className={styles.metaPill}>🏋️ {a.impactForce} G</span>}
        </div>
      )}

      <p className={styles.address}>📍 {a.address}</p>

      {/* Escalation countdown timer */}
      <EscalationTimer createdAt={a.createdAt} accidentType={a.accidentType} />

      {a.impactForce && <ImpactGauge gForce={a.impactForce} severity={a.severity} />}

      {/* Admin view: shows Police & Ambulance timelines */}
      {role === 'admin' && (
        <div className={styles.indicators}>
          <div className={styles.indicator}>
            <span className={styles.label}>🚔 Police Response</span>
            <StatusTimeline status={a.policeStatus} />
          </div>
          <div className={styles.indicator}>
            <span className={styles.label}>🚑 Ambulance Response</span>
            <StatusTimeline status={a.ambulanceStatus} />
          </div>
        </div>
      )}

      {/* Police/Ambulance view: shows only their timeline */}
      {showResponderActions && (
        <div style={{ margin: '1rem 0' }}>
          <StatusTimeline status={getActiveStatus()} />
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <a
          href={`https://www.google.com/maps?q=${a.lat},${a.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.link}
        >
          📍 Map Link →
        </a>

        {/* Responder status updates */}
        {showResponderActions && (
          <div className={styles.actions} style={{ margin: 0 }}>
            <button
              className={styles.btnStatus}
              onClick={() => onStatusChange(a.id, 'en_route')}
              disabled={getActiveStatus() === 'arrived'}
            >
              {role === 'police' ? '🚔 En Route' : '🚑 En Route'}
            </button>
            <button
              className={styles.btnArrived}
              onClick={() => onStatusChange(a.id, 'arrived')}
              disabled={getActiveStatus() === 'arrived'}
            >
              ✅ Arrived
            </button>
          </div>
        )}

        {/* Delete alert button */}
        {showDelete && (
          <button
            className={styles.btnDisconnect}
            style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', borderRadius: '8px' }}
            onClick={() => {
              if (window.confirm('Are you sure you want to delete this incident alert?')) {
                deleteAlert(a.id).catch(console.error)
              }
            }}
          >
            🗑️ Delete Alert
          </button>
        )}
      </div>
    </div>
  )
})

// ── Main Page Component ──
export default function AlertsPage({ onLogout }) {
  const { user, role } = useAuth()
  const [alerts, setAlerts] = useState([])
  const [filters, setFilters] = useState({ severity: '', sort: 'newest' })
  const initialLoadRef = useRef(true)
  const lastAlertIdRef = useRef(null)

  useEffect(() => { requestNotificationPermission() }, [])

  useEffect(() => {
    return subscribeAlerts((list) => {
      // Robust sorting
      const getTime = (item) => {
        if (!item.createdAt) return 0
        if (typeof item.createdAt === 'number') return item.createdAt
        if (item.createdAt.toMillis) return item.createdAt.toMillis()
        if (typeof item.createdAt === 'string') return new Date(item.createdAt).getTime()
        return 0
      }

      list.sort((a, b) => getTime(b) - getTime(a))
      setAlerts(list)

      const newestAlert = list.length > 0 ? list[0] : null
      if (initialLoadRef.current) {
        initialLoadRef.current = false
        if (newestAlert) lastAlertIdRef.current = newestAlert.id
      } else {
        if (newestAlert && newestAlert.id !== lastAlertIdRef.current) {
          lastAlertIdRef.current = newestAlert.id
          playAlertSound()
          showAlertNotification(newestAlert)
        }
      }
    })
  }, [])

  const handleFilterChange = (key, val) => {
    setFilters(prev => ({ ...prev, [key]: val }))
  }

  const handleStatusChange = (alertId, status) => {
    updateAlertStatus(alertId, role, status).catch(console.error)
  }

  const filteredAlerts = applyFilters(alerts, filters, role)

  const pendingCount = alerts.filter(a => a.policeStatus === 'pending' && a.ambulanceStatus === 'pending').length
  const activeCount = alerts.filter(a => a.policeStatus === 'en_route' || a.ambulanceStatus === 'en_route').length
  const arrivedCount = alerts.filter(a => a.policeStatus === 'arrived' && a.ambulanceStatus === 'arrived').length

  return (
    <DashboardLayout title="Live Alerts Console" role={role} user={user} onLogout={onLogout}>
      {/* Stats Bar */}
      <div className={styles.statsBar} id="stats-section">
        <div className={styles.statCard}>
          <span className={styles.statValue}>{alerts.length}</span>
          <span className={styles.statLabel}>Total Alerts</span>
        </div>
        <div className={`${styles.statCard} ${styles.danger}`}>
          <span className={styles.statValue}>{pendingCount}</span>
          <span className={styles.statLabel}>Awaiting Dispatch</span>
        </div>
        <div className={`${styles.statCard} ${styles.warning}`}>
          <span className={styles.statValue}>{activeCount}</span>
          <span className={styles.statLabel}>Units Responding</span>
        </div>
        <div className={`${styles.statCard} ${styles.success}`}>
          <span className={styles.statValue}>{arrivedCount}</span>
          <span className={styles.statLabel}>Fully Resolved</span>
        </div>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <Link to={`/${role}`} className={styles.link} style={{ display: 'inline-flex', padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}>
          ← Back to active dashboard console
        </Link>
      </div>

      {/* Filters */}
      <AlertFilters
        filters={filters}
        onFilter={handleFilterChange}
        role={role}
        total={alerts.length}
        shown={filteredAlerts.length}
      />

      {/* Alert Listings */}
      <div className={styles.list} id="alert-list-section">
        {filteredAlerts.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>🚨</span>
            <p>No active incidents found matching the current console filters.</p>
          </div>
        ) : (
          filteredAlerts.map((a, i) => (
            <AlertCard
              key={a.id}
              a={a}
              index={i}
              role={role}
              onStatusChange={handleStatusChange}
            />
          ))
        )}
      </div>
    </DashboardLayout>
  )
}
