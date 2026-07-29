import { useState, useEffect, useRef, memo, useMemo } from 'react'
import StatusTimeline from '../components/StatusTimeline'
import { useAuth } from '../contexts/AuthContext'
import DashboardLayout from '../components/DashboardLayout'
import StatusBadge from '../components/StatusBadge'
import ImpactGauge from '../components/ImpactGauge'
import AnalyticsPanel from '../components/AnalyticsPanel'
import AlertFilters, { applyFilters } from '../components/AlertFilters'
import { subscribeAlerts, addAlert, deleteAlert, logAlertDeletion, SEVERITY_LABELS } from '../lib/alerts'
import { subscribeUnitLocations } from '../lib/tracking'
import AlertPopup from '../components/AlertPopup'
import { requestNotificationPermission, showAlertNotification, playAlertSound } from '../lib/notifications'
import { isSandboxEnabled } from '../lib/sandbox'
import TestModeBanner from '../components/TestModeBanner'
import TrackingMap from '../components/TrackingMap'
import styles from './Dashboard.module.css'

// ── Live elapsed time hook ──────────────────────────────────────────────────
function useElapsed(createdAt) {
  const [elapsed, setElapsed] = useState('')
  useEffect(() => {
    const tick = () => {
      // Handle different createdAt formats just in case
      const time = typeof createdAt === 'number' ? createdAt : new Date(createdAt).getTime() || 0;
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

// ── Alert Card ──────────────────────────────────────────────────────────────
// 🔥 FIX 2: Accept 'isNearest' as a boolean instead of the whole Set object
const AlertCard = memo(function AlertCard({ a, isNearest, deletedByUid, isFocused, onToggleFocus }) {
  const elapsed = useElapsed(a.createdAt)

  return (
    <div
      className={`${styles.card} ${a.severity ? styles[a.severity] : ''}`}
      style={isFocused ? { outline: '2px solid var(--blue)', outlineOffset: '-1px' } : undefined}
    >
      <div className={styles.cardTop}>
        <span className={styles.vehicle}> Safe Drive</span>
        <div className={styles.cardMeta}>
          {isNearest && <span className={styles.nearestBadge}>📍 Nearest Unit</span>}
          <span className={styles.elapsed}>⏱ {elapsed}</span>
          <span className={styles.time}>{new Date(a.createdAt).toLocaleString()}</span>
        </div>
      </div>

      {a.accidentType && (
        <div className={styles.accidentRow}>
          <span className={styles.accidentType}>💥 {a.accidentType}</span>
          {a.speed && <span className={styles.metaPill}>⚡ {a.speed} km/h</span>}
          {a.severity && <span className={styles.metaPill}>{SEVERITY_LABELS[a.severity]}</span>}
        </div>
      )}

      <p className={styles.address}>📍 {a.address}</p>

      {a.impactForce && <ImpactGauge gForce={a.impactForce} />}

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

      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
        <a
          href={`https://www.google.com/maps?q=${a.lat},${a.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.link}
        >
          📍 Open in Google Maps →
        </a>
        <button
          style={{ padding: '0.4rem 0.85rem', fontSize: '0.78rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: isFocused ? 'var(--blue-bg)' : 'transparent', color: isFocused ? 'var(--blue)' : 'var(--text-secondary)' }}
          onClick={() => onToggleFocus(a.id)}
        >
          {isFocused ? '✖ Show All on Map' : '🎯 Focus on Map'}
        </button>
        <button
          className={styles.btnDisconnect}
          style={{ padding: '0.4rem 0.85rem', fontSize: '0.78rem', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
          onClick={() => {
            if (window.confirm('Are you sure you want to delete this incident alert?')) {
              // Log who deleted what before removing it, so there's an audit
              // trail for a permanently-destructive action on an incident record.
              logAlertDeletion(a.id, deletedByUid, a)
                .catch(console.error)
                .finally(() => deleteAlert(a.id).catch(console.error))
            }
          }}
        >
          🗑️ Delete Alert
        </button>
      </div>
    </div>
  )
})

// ── Compute which alert each unit is nearest to ─────────────────────────────
function getNearestAlertIds(units, alerts) {
  const ids = new Set()
  units.forEach(u => {
    if (!u.alertId) return
    let minDist = Infinity
    let nearestId = null
    alerts.forEach(a => {
      const dist = Math.hypot(u.lat - a.lat, u.lng - a.lng)
      if (dist < minDist) { minDist = dist; nearestId = a.id }
    })
    if (nearestId) ids.add(nearestId)
  })
  return ids
}

// ── Main Dashboard ──────────────────────────────────────────────────────────
export default function AdminDashboard({ onLogout }) {
  const { user } = useAuth()
  const [alerts, setAlerts]         = useState([])
  const [units, setUnits]           = useState([])
  const [filters, setFilters]       = useState({ severity: '', sort: 'newest' })
  const [popupAlert, setPopupAlert] = useState(null)
  // Clicking "Focus on Map" on an alert card filters the map down to just
  // that incident (and units responding to it) instead of showing everything.
  const [focusedAlertId, setFocusedAlertId] = useState(null)

  const initialLoadRef  = useRef(true)
  const lastAlertIdRef  = useRef(null)

  useEffect(() => { requestNotificationPermission() }, [])

  // ── Firestore real-time subscription ───────────────────────────────────────
  useEffect(() => {
    const unsubAlerts = subscribeAlerts((list) => {
      // 🔥 FIX 1: ROBUST SORTING
      // Safely extracts time whether it's a Number, String, or Firestore Timestamp object.
      // This guarantees the newest alert is ALWAYS at list[0], fixing the popup bug.
      const getTime = (item) => {
        if (!item.createdAt) return 0;
        if (typeof item.createdAt === 'number') return item.createdAt;
        if (item.createdAt.toMillis) return item.createdAt.toMillis(); // Firestore Timestamp
        if (typeof item.createdAt === 'string') return new Date(item.createdAt).getTime();
        return 0;
      };
      
      list.sort((a, b) => getTime(b) - getTime(a));
      setAlerts(list);

      const newestAlert = list.length > 0 ? list[0] : null;

      if (initialLoadRef.current) {
        initialLoadRef.current = false;
        if (newestAlert) lastAlertIdRef.current = newestAlert.id;
      } else {
        if (newestAlert && newestAlert.id !== lastAlertIdRef.current) {
          lastAlertIdRef.current = newestAlert.id;
          
          console.log('🚨 NEW ALERT POPUP:', newestAlert.id, newestAlert.accidentType);
          
          setPopupAlert(newestAlert);
          playAlertSound();
          showAlertNotification(newestAlert);
        }
      }
    });

    const unsubUnits = subscribeUnitLocations(setUnits);
    return () => { unsubAlerts(); unsubUnits(); };
  }, []);

  const handleFilterChange = (key, val) => {
    setFilters(prev => ({ ...prev, [key]: val }))
  }

  const handleToggleFocus = (alertId) => {
    setFocusedAlertId(prev => prev === alertId ? null : alertId)
  }

  const filteredAlerts = applyFilters(alerts, filters, 'admin')
  const nearestUnits = useMemo(() => getNearestAlertIds(units, alerts), [units, alerts]);

  // When an accident is focused, the map shows only that one incident and
  // only units responding to it. Unfocused, the map keeps showing every
  // alert regardless of the list's severity/sort filter (unchanged from
  // before — the map and the filtered list below are independent views).
  const mapAlerts = focusedAlertId ? alerts.filter(a => a.id === focusedAlertId) : alerts
  const mapUnits = focusedAlertId ? units.filter(u => u.alertId === focusedAlertId) : units

  const totalCount     = alerts.length
  const pendingCount   = alerts.filter(a => a.policeStatus === 'pending' && a.ambulanceStatus === 'pending').length
  const respondedCount = alerts.filter(a => a.policeStatus !== 'pending' || a.ambulanceStatus !== 'pending').length
  const arrivedCount   = alerts.filter(a => a.policeStatus === 'arrived' && a.ambulanceStatus === 'arrived').length

  return (
    <DashboardLayout title="Monitor Response" role="admin" user={user} onLogout={onLogout}>
      {alerts.some(a => a.isTest) && <TestModeBanner />}
      {popupAlert && (
        <AlertPopup
          alert={popupAlert}
          onClose={() => setPopupAlert(null)}
          onView={() => setPopupAlert(null)}
        />
      )}

      <div id="stats-section" className={styles.statsBar}>
        <div className={`${styles.statCard}`}>
          <span className={styles.statValue}>{totalCount}</span>
          <span className={styles.statLabel}>Total Alerts</span>
        </div>
        <div className={`${styles.statCard} ${styles.danger}`}>
          <span className={styles.statValue}>{pendingCount}</span>
          <span className={styles.statLabel}>Awaiting Response</span>
        </div>
        <div className={`${styles.statCard} ${styles.warning}`}>
          <span className={styles.statValue}>{respondedCount}</span>
          <span className={styles.statLabel}>Responding</span>
        </div>
        <div className={`${styles.statCard} ${styles.success}`}>
          <span className={styles.statValue}>{arrivedCount}</span>
          <span className={styles.statLabel}>Case Closed</span>
        </div>
      </div>

      <TrackingMap alerts={mapAlerts} units={mapUnits} focusedAlertId={focusedAlertId} />
      {focusedAlertId && (
        <div className={styles.hint} style={{ marginTop: '-1.25rem' }}>
          🎯 Showing 1 of {alerts.length} accidents on the map.
          <button
            onClick={() => setFocusedAlertId(null)}
            style={{ marginLeft: '0.5rem', background: 'transparent', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}
          >
            Show All
          </button>
        </div>
      )}
      <AnalyticsPanel alerts={alerts} />

      <div className={styles.hint}>
        Response status:&nbsp;
        <StatusBadge status="pending" /> &nbsp;·&nbsp;
        <StatusBadge status="en_route" /> &nbsp;·&nbsp;
        <StatusBadge status="arrived" />
      </div>

      {/* Demo-only test-alert generator — gated behind VITE_ENABLE_SANDBOX so it
          doesn't ship live to real Police/Ambulance dashboards by default.
          Set VITE_ENABLE_SANDBOX=true in the deployment env when actually
          running a live demo. See docs/features/admin-dashboard.md §5. */}
      {isSandboxEnabled() && (
        <div className={styles.bleBar} style={{ marginTop: '0px', marginBottom: '2rem', background: 'rgba(59, 130, 246, 0.05)', borderColor: 'rgba(59, 130, 246, 0.2)' }}>
          <div className={styles.bleInfo}>
            <span style={{ color: 'var(--blue)', fontWeight: '700', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              💡 Presentation Sandbox
            </span>
            <span className={styles.bleMsg}>Simulate IoT alert scenarios for live demonstrations</span>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              className={styles.btnConnect}
              style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red-deep) 100%)', boxShadow: 'none', border: 'none' }}
              onClick={() => addAlert({
                severity: 'critical', accidentType: 'Major collision (Simulated)', impactForce: '9.4', speed: 82,
                lat: 6.9271, lng: 79.8612, address: 'Simulated Location', createdAt: Date.now()
              })}
            >
              💥 Test Major Accident
            </button>
            <button
              className={styles.btnConnect}
              style={{ background: 'linear-gradient(135deg, var(--amber) 0%, var(--amber-dark) 100%)', boxShadow: 'none', border: 'none' }}
              onClick={() => addAlert({
                severity: 'high', accidentType: 'Minor collision (Simulated)', impactForce: '3.2', speed: 28,
                lat: 6.9271, lng: 79.8612, address: 'Simulated Location', createdAt: Date.now()
              })}
            >
              ⏳ Test Minor Accident
            </button>
          </div>
        </div>
      )}

      <AlertFilters
        filters={filters}
        onFilter={handleFilterChange}
        role="admin"
        total={alerts.length}
        shown={filteredAlerts.length}
      />

      <div id="alert-list-section" className={styles.list}>
        {filteredAlerts.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>📡</span>
            <p>{alerts.length === 0
              ? 'No alerts yet. Incidents reported from the field will appear here in real time.'
              : 'No alerts match the current filters.'
            }</p>
          </div>
        ) : (
          filteredAlerts.map(a => (
            // 🔥 FIX 2: Pass boolean instead of the Set object to stop re-renders
            <AlertCard
              key={a.id}
              a={a}
              isNearest={nearestUnits.has(a.id)}
              deletedByUid={user?.uid}
              isFocused={focusedAlertId === a.id}
              onToggleFocus={handleToggleFocus}
            />
          ))
        )}
      </div>
    </DashboardLayout>
  )
}