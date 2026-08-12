import { useState, useRef, useEffect } from 'react'
import { updateUnitLocation } from '../lib/tracking'
import { fetchRoute, routeLength, stepAlongRoute } from '../lib/routing'
import { addTestAlert, updateAlertStatus, deleteAlert } from '../lib/alerts'

const MALABE_BUS_STAND = { lat: 6.9039, lng: 79.9544 }
const CINEC_CAMPUS = { lat: 6.915423, lng: 79.96052 }
const DURATION_MS = 120000 // ~2 minutes, a believable urban response time
const TICK_MS = 1000

// Header control that animates this responder's unit along the real road
// route from Malabe Bus Stand to CINEC Campus, for demoing live tracking
// without needing a real accident or real GPS.
//
// Writes a REAL alert via addTestAlert() (tagged isTest: true, same
// mechanism the Sensor Test Screen uses) rather than keeping it
// client-side-only — that way every dashboard subscribed to the normal
// alerts/units feeds (Admin included) sees the same live tracking
// automatically, with no per-dashboard wiring needed. TestModeBanner
// picks it up the same way it does any other isTest record.
export default function SimulateDropdown({ role, uid }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('idle') // idle | running | done
  const [remainingMs, setRemainingMs] = useState(DURATION_MS)
  const intervalRef = useRef(null)
  const routeRef = useRef(null)
  const alertIdRef = useRef(null)
  const startedAtRef = useRef(0)

  useEffect(() => () => cleanup(), []) // eslint-disable-line react-hooks/exhaustive-deps

  const cleanup = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = null
  }

  const handleStart = async () => {
    setOpen(false)
    setStatus('running')
    setRemainingMs(DURATION_MS)

    const alertId = addTestAlert({
      severity: 'high',
      accidentType: 'Live Tracking Demo',
      lat: CINEC_CAMPUS.lat,
      lng: CINEC_CAMPUS.lng,
      address: 'CINEC Campus, Malabe',
    })
    alertIdRef.current = alertId
    await updateAlertStatus(alertId, role, 'en_route')

    const coords = await fetchRoute(
      [MALABE_BUS_STAND.lat, MALABE_BUS_STAND.lng],
      [CINEC_CAMPUS.lat, CINEC_CAMPUS.lng]
    )
    const path = coords && coords.length > 1
      ? coords
      : [[MALABE_BUS_STAND.lat, MALABE_BUS_STAND.lng], [CINEC_CAMPUS.lat, CINEC_CAMPUS.lng]]
    routeRef.current = path

    const totalLen = routeLength(path)
    const ticks = DURATION_MS / TICK_MS
    const stepDeg = totalLen / ticks
    let traveled = 0
    startedAtRef.current = Date.now()

    intervalRef.current = setInterval(() => {
      traveled += stepDeg
      const step = stepAlongRoute(routeRef.current, traveled)
      updateUnitLocation(
        uid, role, step.lat, step.lng, alertId,
        MALABE_BUS_STAND.lat, MALABE_BUS_STAND.lng
      )
      const elapsed = Date.now() - startedAtRef.current
      setRemainingMs(Math.max(0, DURATION_MS - elapsed))
      if (step.done) {
        cleanup()
        updateAlertStatus(alertId, role, 'arrived').catch(console.error)
        setStatus('done')
      }
    }, TICK_MS)
  }

  const handleStop = () => {
    cleanup()
    setStatus('idle')
    setOpen(false)
    if (alertIdRef.current) {
      deleteAlert(alertIdRef.current).catch(console.error)
      alertIdRef.current = null
    }
    updateUnitLocation(uid, role, MALABE_BUS_STAND.lat, MALABE_BUS_STAND.lng, null)
  }

  const secondsLeft = Math.ceil(remainingMs / 1000)

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)', background: 'var(--bg-2)',
          color: 'var(--text-primary)', fontSize: '0.8rem', fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        🧭 Simulate
        {status === 'running' && <span style={{ color: 'var(--blue)' }}>· {secondsLeft}s</span>}
        <span style={{ fontSize: '0.65rem', opacity: 0.6 }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 40,
          background: 'var(--bg-1)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '0.6rem', minWidth: '260px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            Live tracking demo
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
            Malabe Bus Stand → CINEC Campus, real road route, ~2 min. Visible on every dashboard, tagged as test data.
          </div>
          {status === 'running' ? (
            <button
              onClick={handleStop}
              style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--red-border, #ef4444)', background: 'transparent', color: 'var(--red, #ef4444)', fontWeight: 600, cursor: 'pointer' }}
            >
              ⏹ Stop simulation ({secondsLeft}s left)
            </button>
          ) : (
            <button
              onClick={handleStart}
              style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--blue)', background: 'var(--blue-bg)', color: 'var(--blue)', fontWeight: 600, cursor: 'pointer' }}
            >
              ▶ Start: Malabe → CINEC
            </button>
          )}
          {status === 'done' && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: 'var(--green, #10b981)' }}>
              ✓ Arrived at CINEC. Start again to replay.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
