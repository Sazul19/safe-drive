import { useState, useEffect, useRef } from 'react'
import StatusTimeline from '../components/StatusTimeline'
import { useAuth } from '../contexts/AuthContext'
import DashboardLayout from '../components/DashboardLayout'
import AlertPopup from '../components/AlertPopup'
import StatusBadge from '../components/StatusBadge'
import ImpactGauge from '../components/ImpactGauge'
import EscalationTimer from '../components/EscalationTimer'
import AlertFilters, { applyFilters } from '../components/AlertFilters'
import { subscribeAlerts, updateAlertStatus } from '../lib/alerts'
import { requestNotificationPermission, showAlertNotification, playAlertSound } from '../lib/notifications'
import { updateUnitLocation, subscribeUnitLocations } from '../lib/tracking'
import { startLocationWatch, stopLocationWatch } from '../lib/ble'
import TestModeBanner from '../components/TestModeBanner'
import TrackingMap from '../components/TrackingMap'
import SimulateDropdown from '../components/SimulateDropdown'
import styles from './Dashboard.module.css'

// Auto-arrival geofence radius, in degrees (~0.001° ≈ 111m at this latitude).
const ARRIVAL_GEOFENCE_DEG = 0.001
// Only trust a position for auto-arrival if the browser reports accuracy
// at or below this (meters). Real phone GPS is typically 5-20m; laptops
// without a GPS chip often report accuracy in the hundreds/thousands of
// meters via WiFi/IP-based estimation — not precise enough to trust for a
// ~111m proximity decision.
const MIN_ARRIVAL_ACCURACY_M = 100

// ── Live elapsed time hook ──────────────────────────────────────────────────
function useElapsed(createdAt) {
  const [elapsed, setElapsed] = useState('')
  useEffect(() => {
    const tick = () => {
      const secs = Math.floor((Date.now() - createdAt) / 1000)
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

// ── Alert Card (Police view) ────────────────────────────────────────────────
function AlertCard({ a, index, onStatusChange, isFocused, onToggleFocus }) {
  const elapsed = useElapsed(a.createdAt)

  return (
    <div
      className={`${styles.card} ${a.severity ? styles[a.severity] : ''}`}
      style={isFocused ? { outline: '2px solid var(--blue)', outlineOffset: '-1px' } : undefined}
    >
      <div className={styles.cardTop}>
        <span className={styles.vehicle}>Safe Drive</span>
        <div className={styles.cardMeta}>
          {index === 0 && <span className={styles.newBadge}>● New</span>}
          <span className={styles.elapsed}>⏱ {elapsed}</span>
          <StatusBadge status={a.policeStatus} />
        </div>
      </div>

      {a.accidentType && (
        <div className={styles.accidentRow}>
          <span className={styles.accidentType}>💥 {a.accidentType}</span>
          {a.speed && <span className={styles.metaPill}>⚡ {a.speed} km/h</span>}
        </div>
      )}

      <p className={styles.address}>📍 {a.address}</p>

      {/* Minor alert escalation countdown */}
      <EscalationTimer createdAt={a.createdAt} accidentType={a.accidentType} />

      {a.impactForce && <ImpactGauge gForce={a.impactForce} severity={a.severity} />}

      <StatusTimeline status={a.policeStatus} />
      <p className={styles.time}>{new Date(a.createdAt).toLocaleString()}</p>

      <div className={styles.actions}>
        <button
          className={styles.btnStatus}
          onClick={() => onStatusChange(a.id, 'en_route')}
          disabled={a.policeStatus === 'arrived'}
        >
          🚔 I'm En Route
        </button>
        <button
          className={styles.btnArrived}
          onClick={() => onStatusChange(a.id, 'arrived')}
          disabled={a.policeStatus === 'arrived'}
        >
          ✅ Arrived at Scene
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
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
      </div>
    </div>
  )
}

// ── Main Dashboard ──────────────────────────────────────────────────────────
export default function PoliceDashboard({ onLogout }) {
  const { user } = useAuth()
  const [alerts, setAlerts]     = useState([])
  const [units, setUnits]       = useState([])
  const [popupAlert, setPopupAlert] = useState(null)
  // Clicking "Focus on Map" on an alert card filters the map down to just
  // that incident (and units responding to it) instead of showing everything.
  const [focusedAlertId, setFocusedAlertId] = useState(null)
  const [filters, setFilters]   = useState({ severity: '', policeStatus: '', sort: 'newest' })
  const prevCountRef    = useRef(0)
  const initialLoadRef  = useRef(true)
  const [hasLocation, setHasLocation] = useState(false)
  const [lowAccuracy, setLowAccuracy] = useState(false)
  // Client-side-only alert injected by the header's Simulate dropdown while
  // a demo (Malabe → CINEC) is running — never written to Firebase's
  // alerts/ collection, just merged into what the map renders so
  // TrackingMap draws the route exactly as it would for a real incident.
  const [demoAlert, setDemoAlert] = useState(null)

  // Keeps the latest alerts available inside the geolocation callback below
  // without re-registering that callback every time alerts change.
  const alertsRef = useRef([])
  useEffect(() => { alertsRef.current = alerts }, [alerts])

  // Which alert THIS officer explicitly clicked "En Route" on — set only by
  // setStatus() below, never inferred from the shared alerts list. With
  // multiple alerts simultaneously en_route (common — several accidents can
  // be active at once, plus leftover test alerts), picking "whichever one
  // is en_route" is ambiguous and can silently track the wrong alert's
  // location. This ref is the single source of truth for which incident
  // this device's GPS should be compared against.
  const myAlertIdRef = useRef(null)
  // Which id we've already captured a dispatch-start position for, and that
  // position — just bookkeeping for TrackingMap's route origin, not invented data.
  const startCapturedIdRef = useRef(null)
  const startCoordsRef = useRef({ lat: null, lng: null })

  useEffect(() => { requestNotificationPermission() }, [])

  // Pure real-device GPS tracking: every time the browser reports a new
  // position, write it straight to Firebase and — only for the specific
  // alert this officer accepted (myAlertIdRef) — check the arrival
  // geofence. If GPS is never available, this simply never fires — no
  // fake/fallback position is ever written, so the unit just won't appear
  // on the map.
  useEffect(() => {
    if (!user) return
    startLocationWatch((loc) => {
      setHasLocation(true)
      setLowAccuracy(loc.accuracy != null && loc.accuracy > MIN_ARRIVAL_ACCURACY_M)
      const myId = myAlertIdRef.current
      const alert = myId ? alertsRef.current.find(a => a.id === myId) : null

      if (alert && alert.policeStatus === 'en_route') {
        if (startCapturedIdRef.current !== alert.id) {
          startCapturedIdRef.current = alert.id
          startCoordsRef.current = { lat: loc.lat, lng: loc.lng }
        }
        // Skip the auto-arrival check on imprecise fixes (e.g. a laptop
        // with no GPS chip falling back to WiFi/IP-based estimation, often
        // off by kilometers) — still shown on the map, just not trusted
        // for a ~111m proximity decision. Position keeps updating either way.
        const dist = Math.hypot(alert.lat - loc.lat, alert.lng - loc.lng)
        const accurateEnough = loc.accuracy == null || loc.accuracy <= MIN_ARRIVAL_ACCURACY_M
        if (accurateEnough && dist <= ARRIVAL_GEOFENCE_DEG) {
          updateAlertStatus(alert.id, 'police', 'arrived').catch(console.error)
        }
        updateUnitLocation(user.uid, 'police', loc.lat, loc.lng, alert.id, startCoordsRef.current.lat, startCoordsRef.current.lng)
      } else if (alert && alert.policeStatus === 'arrived') {
        updateUnitLocation(user.uid, 'police', loc.lat, loc.lng, alert.id, startCoordsRef.current.lat, startCoordsRef.current.lng)
      } else {
        // Not tracking any specific alert (nothing accepted yet, or the
        // accepted one was resolved/removed) — report position as idle.
        myAlertIdRef.current = null
        startCapturedIdRef.current = null
        startCoordsRef.current = { lat: null, lng: null }
        updateUnitLocation(user.uid, 'police', loc.lat, loc.lng, null)
      }
    })
    return () => stopLocationWatch()
  }, [user])

  useEffect(() => {
    const unsubAlerts = subscribeAlerts((list) => {
      const prev = prevCountRef.current
      setAlerts(list)
      if (initialLoadRef.current) {
        initialLoadRef.current = false
      } else if (list.length > prev && list[0]) {
        setPopupAlert(list[0])
        playAlertSound()
        showAlertNotification(list[0])
      }
      prevCountRef.current = list.length
    })
    const unsubUnits = subscribeUnitLocations(setUnits)
    return () => { unsubAlerts(); unsubUnits() }
  }, [])

  const handleFilterChange = (key, val) => setFilters(prev => ({ ...prev, [key]: val }))

  const setStatus = (alertId, status) => {
    if (status === 'en_route') {
      // This is now the one specific alert this device's GPS tracks —
      // see myAlertIdRef above.
      myAlertIdRef.current = alertId
    }
    updateAlertStatus(alertId, 'police', status).catch(console.error)
  }

  const handleToggleFocus = (alertId) => {
    setFocusedAlertId(prev => prev === alertId ? null : alertId)
  }

  const filteredAlerts = applyFilters(alerts, filters, 'police')
  const pendingCount  = alerts.filter(a => a.policeStatus === 'pending').length
  const enRouteCount  = alerts.filter(a => a.policeStatus === 'en_route').length
  const arrivedCount  = alerts.filter(a => a.policeStatus === 'arrived').length

  // When an accident is focused, the map shows only that one incident and
  // only units responding to it. Unfocused, the map keeps showing every
  // alert regardless of the list's severity/status filter (unchanged from
  // before — the map and the filtered list below are independent views).
  const alertsWithDemo = demoAlert ? [...alerts, demoAlert] : alerts
  const mapAlerts = focusedAlertId ? alertsWithDemo.filter(a => a.id === focusedAlertId) : alertsWithDemo
  const mapUnits = focusedAlertId ? units.filter(u => u.alertId === focusedAlertId) : units

  return (
    <DashboardLayout
      title="Emergency Alerts"
      role="police"
      user={user}
      onLogout={onLogout}
      headerActions={user && <SimulateDropdown role="police" uid={user.uid} onDemoAlertChange={setDemoAlert} />}
    >
      {alerts.some(a => a.isTest) && <TestModeBanner />}
      {popupAlert && (
        <AlertPopup
          alert={popupAlert}
          onClose={() => setPopupAlert(null)}
          onView={() => setPopupAlert(null)}
        />
      )}

      {/* Stats */}
      <div id="stats-section" className={styles.statsBar}>
        <div className={`${styles.statCard} ${styles.danger}`}>
          <span className={styles.statValue}>{pendingCount}</span>
          <span className={styles.statLabel}>Awaiting Response</span>
        </div>
        <div className={`${styles.statCard} ${styles.warning}`}>
          <span className={styles.statValue}>{enRouteCount}</span>
          <span className={styles.statLabel}>En Route</span>
        </div>
        <div className={`${styles.statCard} ${styles.success}`}>
          <span className={styles.statValue}>{arrivedCount}</span>
          <span className={styles.statLabel}>Arrived</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{alerts.length}</span>
          <span className={styles.statLabel}>Total Received</span>
        </div>
      </div>

      <p className={styles.hint}>
        {!hasLocation
          ? '📍 Waiting for location permission…'
          : lowAccuracy
            ? '📍 Low-accuracy location (no GPS hardware) — mark arrival manually'
            : '📍 Live GPS tracking active'}
      </p>

      {/* Dispatch Map */}
      <TrackingMap alerts={mapAlerts} units={mapUnits} focusedAlertId={focusedAlertId} />
      {focusedAlertId && (
        <p className={styles.hint} style={{ marginTop: '-1.25rem' }}>
          🎯 Showing 1 of {alerts.length} accidents on the map.
          <button
            onClick={() => setFocusedAlertId(null)}
            style={{ marginLeft: '0.5rem', background: 'transparent', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}
          >
            Show All
          </button>
        </p>
      )}

      {/* Filters */}
      <AlertFilters
        filters={filters}
        onFilter={handleFilterChange}
        role="police"
        total={alerts.length}
        shown={filteredAlerts.length}
      />

      <div id="alert-list-section" className={styles.list}>
        {filteredAlerts.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>🚔</span>
            <p>{alerts.length === 0
              ? 'No alerts yet. New accident alerts will appear here instantly with sound and popup notification.'
              : 'No alerts match the current filters.'
            }</p>
          </div>
        ) : (
          filteredAlerts.map((a, i) => (
            <AlertCard
              key={a.id}
              a={a}
              index={i}
              onStatusChange={setStatus}
              isFocused={focusedAlertId === a.id}
              onToggleFocus={handleToggleFocus}
            />
          ))
        )}
      </div>
    </DashboardLayout>
  )
}
