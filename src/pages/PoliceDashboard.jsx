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
import { fetchRoute, stepAlongRoute } from '../lib/routing'
import { isRouteSimEnabled, setRouteSimEnabled } from '../lib/sandbox'
import TestModeBanner from '../components/TestModeBanner'
import TrackingMap from '../components/TrackingMap'
import styles from './Dashboard.module.css'

// Fixed dispatch point used when real device GPS isn't available (Malabe
// Bus Stand, Sri Lanka) — a unit only moves from here if location-tracking
// is explicitly turned on; otherwise it just sits here until real GPS
// arrives or the responder manually updates status.
const DISPATCH_START = { lat: 6.9039, lng: 79.9544 }
const ROUTE_STEP_DEG = 0.0006 // per 3s tick, along actual road geometry

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
  const simPosRef = useRef(null)
  // Real device GPS position, when available, always wins. When it isn't
  // available, a unit stays put at DISPATCH_START unless route-tracking is
  // explicitly turned on (routeSimEnabled) — no fake movement by default.
  const realPosRef = useRef(null)
  const [routeSimEnabled, setRouteSimEnabledState] = useState(isRouteSimEnabled())
  const routeCoordsRef = useRef(null)
  const routeProgressRef = useRef(0)

  if (!simPosRef.current) {
    simPosRef.current = {
      lat: DISPATCH_START.lat,
      lng: DISPATCH_START.lng,
      startLat: null,
      startLng: null,
      activeAlertId: null
    }
  }

  useEffect(() => { requestNotificationPermission() }, [])

  useEffect(() => {
    startLocationWatch((loc) => {
      realPosRef.current = loc
    })
    return () => stopLocationWatch()
  }, [])

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

  // Location tracking — real device GPS (realPosRef) always wins when
  // available. Without it, a unit stays put at DISPATCH_START and does
  // nothing else unless routeSimEnabled is explicitly turned on, in which
  // case it walks the actual road route to the incident (fetched from
  // OSRM, same source TrackingMap draws) instead of any straight-line
  // shortcut — no movement is invented unless this is on.
  useEffect(() => {
    if (!user) return
    const interval = setInterval(async () => {
      const activeAlert = alerts.find(a => a.policeStatus === 'en_route')
      const arrivedAlert = alerts.find(a => a.policeStatus === 'arrived')
      const state = simPosRef.current
      const real = realPosRef.current

      if (real) {
        state.lat = real.lat
        state.lng = real.lng
      }

      if (activeAlert) {
        if (state.activeAlertId !== activeAlert.id) {
          state.activeAlertId = activeAlert.id
          state.startLat = state.lat
          state.startLng = state.lng
          routeCoordsRef.current = null
          routeProgressRef.current = 0
        }

        if (real) {
          // Genuine proximity check against the actual device position.
          const dist = Math.hypot(activeAlert.lat - state.lat, activeAlert.lng - state.lng)
          if (dist <= 0.001) {
            updateAlertStatus(activeAlert.id, 'police', 'arrived').catch(console.error)
          }
          updateUnitLocation(user.uid, 'police', state.lat, state.lng, activeAlert.id, state.startLat, state.startLng)
        } else if (routeSimEnabled) {
          if (!routeCoordsRef.current) {
            // First tick after dispatch — fetch the real road route once,
            // walk it on subsequent ticks.
            const coords = await fetchRoute([state.lat, state.lng], [activeAlert.lat, activeAlert.lng])
            routeCoordsRef.current = coords && coords.length > 1
              ? coords
              : [[state.lat, state.lng], [activeAlert.lat, activeAlert.lng]]
          } else {
            routeProgressRef.current += ROUTE_STEP_DEG
            const step = stepAlongRoute(routeCoordsRef.current, routeProgressRef.current)
            state.lat = step.lat
            state.lng = step.lng
            if (step.done) {
              updateAlertStatus(activeAlert.id, 'police', 'arrived').catch(console.error)
            }
          }
          updateUnitLocation(user.uid, 'police', state.lat, state.lng, activeAlert.id, state.startLat, state.startLng)
        } else {
          // No real GPS and tracking not enabled — stay put, no auto-arrival.
          updateUnitLocation(user.uid, 'police', state.lat, state.lng, activeAlert.id, state.startLat, state.startLng)
        }
      } else if (arrivedAlert) {
        if (!real) {
          state.lat = arrivedAlert.lat
          state.lng = arrivedAlert.lng
        }
        if (state.activeAlertId !== arrivedAlert.id) {
          state.activeAlertId = arrivedAlert.id
          if (state.startLat === null) {
            state.startLat = real ? state.lat : arrivedAlert.lat - 0.005
            state.startLng = real ? state.lng : arrivedAlert.lng - 0.005
          }
        }
        updateUnitLocation(user.uid, 'police', state.lat, state.lng, arrivedAlert.id, state.startLat, state.startLng)
      } else {
        state.activeAlertId = null
        state.startLat = null
        state.startLng = null
        routeCoordsRef.current = null
        routeProgressRef.current = 0
        updateUnitLocation(user.uid, 'police', state.lat, state.lng, null)
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [user, alerts, routeSimEnabled])

  const handleFilterChange = (key, val) => setFilters(prev => ({ ...prev, [key]: val }))

  const setStatus = (alertId, status) => {
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
  const mapAlerts = focusedAlertId ? alerts.filter(a => a.id === focusedAlertId) : alerts
  const mapUnits = focusedAlertId ? units.filter(u => u.alertId === focusedAlertId) : units

  return (
    <DashboardLayout title="Emergency Alerts" role="police" user={user} onLogout={onLogout}>
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

      <p className={styles.hint}>📍 Live tracking active</p>

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

      <button
        onClick={() => {
          const next = !routeSimEnabled
          setRouteSimEnabled(next)
          setRouteSimEnabledState(next)
        }}
        title="Toggle location tracking"
        aria-label="Toggle location tracking"
        style={{
          display: 'block', margin: '2rem auto 0', padding: '2px 8px',
          fontSize: '0.7rem', opacity: 0.25, background: 'transparent',
          border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
        }}
      >
        •
      </button>
    </DashboardLayout>
  )
}
