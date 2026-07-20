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
import TrackingMap from '../components/TrackingMap'
import styles from './Dashboard.module.css'

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
function AlertCard({ a, index, onStatusChange }) {
  const elapsed = useElapsed(a.createdAt)

  return (
    <div className={`${styles.card} ${a.severity ? styles[a.severity] : ''}`}>
      <div className={styles.cardTop}>
        <span className={styles.vehicle}>🚗 Smart Vehicle Alert</span>
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

      {a.impactForce && <ImpactGauge gForce={a.impactForce} />}

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

      <a
        href={`https://www.google.com/maps?q=${a.lat},${a.lng}`}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.link}
      >
        📍 Open in Google Maps →
      </a>
    </div>
  )
}

// ── Main Dashboard ──────────────────────────────────────────────────────────
export default function PoliceDashboard({ onLogout }) {
  const { user } = useAuth()
  const [alerts, setAlerts]     = useState([])
  const [units, setUnits]       = useState([])
  const [popupAlert, setPopupAlert] = useState(null)
  const [filters, setFilters]   = useState({ severity: '', policeStatus: '', sort: 'newest' })
  const prevCountRef    = useRef(0)
  const initialLoadRef  = useRef(true)
  const simPosRef = useRef(null)
  // Real device GPS position, when available — overrides the simulated
  // random-walk/interpolation below. Falls back to simulation if the
  // browser/device denies or lacks geolocation, so the demo still works.
  const realPosRef = useRef(null)
  const gpsFlagSetRef = useRef(false)
  const [usingRealGPS, setUsingRealGPS] = useState(false)

  if (!simPosRef.current) {
    simPosRef.current = {
      lat: 6.9271 + (Math.random() - 0.5) * 0.01,
      lng: 79.8612 + (Math.random() - 0.5) * 0.01,
      startLat: null,
      startLng: null,
      activeAlertId: null
    }
  }

  useEffect(() => { requestNotificationPermission() }, [])

  useEffect(() => {
    startLocationWatch((loc) => {
      realPosRef.current = loc
      if (!gpsFlagSetRef.current) {
        gpsFlagSetRef.current = true
        setUsingRealGPS(true)
      }
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

  // Location tracking — uses real device GPS when available (realPosRef),
  // otherwise falls back to the simulated random-walk/interpolation so the
  // demo still works without a location-enabled device.
  useEffect(() => {
    if (!user) return
    const interval = setInterval(() => {
      const activeAlert = alerts.find(a => a.policeStatus === 'en_route')
      const arrivedAlert = alerts.find(a => a.policeStatus === 'arrived')
      const state = simPosRef.current
      const real = realPosRef.current

      // Real GPS always wins when present — overwrite the simulated
      // position with the actual device reading before doing anything else.
      if (real) {
        state.lat = real.lat
        state.lng = real.lng
      }

      if (activeAlert) {
        // Initialize start position on route transition
        if (state.activeAlertId !== activeAlert.id) {
          state.activeAlertId = activeAlert.id
          state.startLat = state.lat
          state.startLng = state.lng
        }

        const targetLat = activeAlert.lat
        const targetLng = activeAlert.lng
        const dLat = targetLat - state.lat
        const dLng = targetLng - state.lng
        const dist = Math.hypot(dLat, dLng)

        // Dynamic arrival detection (geofence radius of ~110m) — with real
        // GPS this is a genuine proximity check against the actual device position.
        if (dist <= 0.001) {
          if (!real) { state.lat = targetLat; state.lng = targetLng }
          // Transition status to arrived automatically
          updateAlertStatus(activeAlert.id, 'police', 'arrived').catch(console.error)
          // Lock final coordinates in db
          updateUnitLocation(user.uid, 'police', state.lat, state.lng, activeAlert.id, state.startLat, state.startLng)
        } else {
          if (!real) {
            // Simulated movement only when there's no real position feed
            state.lat += (dLat / dist) * 0.0008
            state.lng += (dLng / dist) * 0.0008
          }
          updateUnitLocation(user.uid, 'police', state.lat, state.lng, activeAlert.id, state.startLat, state.startLng)
        }
      } else if (arrivedAlert) {
        if (!real) {
          // Freeze position at incident site, preserving start path
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
        // Clear active/arrived record routes
        state.activeAlertId = null
        state.startLat = null
        state.startLng = null
        if (!real) {
          // Idle wandering (simulation only — real GPS just sits at the device's actual position)
          state.lat += (Math.random() - 0.5) * 0.0005
          state.lng += (Math.random() - 0.5) * 0.0005
        }
        updateUnitLocation(user.uid, 'police', state.lat, state.lng, null)
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [user, alerts])

  const handleFilterChange = (key, val) => setFilters(prev => ({ ...prev, [key]: val }))

  const setStatus = (alertId, status) => {
    updateAlertStatus(alertId, 'police', status).catch(console.error)
  }

  const filteredAlerts = applyFilters(alerts, filters, 'police')
  const pendingCount  = alerts.filter(a => a.policeStatus === 'pending').length
  const enRouteCount  = alerts.filter(a => a.policeStatus === 'en_route').length
  const arrivedCount  = alerts.filter(a => a.policeStatus === 'arrived').length

  return (
    <DashboardLayout title="Emergency Alerts" role="police" user={user} onLogout={onLogout}>
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
        {usingRealGPS ? '📍 Using your device\'s live GPS position' : '📍 Simulated position (no GPS permission/support — demo mode)'}
      </p>

      {/* Dispatch Map */}
      <TrackingMap alerts={alerts} units={units} />

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
            <AlertCard key={a.id} a={a} index={i} onStatusChange={setStatus} />
          ))
        )}
      </div>
    </DashboardLayout>
  )
}
