import { useState, useRef, useEffect } from 'react'
import { updateUnitLocation } from '../lib/tracking'
import { fetchRoute, routeLength, stepAlongRoute } from '../lib/routing'

const MALABE_BUS_STAND = { lat: 6.9039, lng: 79.9544 }
const CINEC_CAMPUS = { lat: 6.915423, lng: 79.96052 }
const DEMO_ALERT_ID = 'demo-malabe-cinec'
const DURATION_MS = 120000 // ~2 minutes, a believable urban response time
const TICK_MS = 1000

// Header control that animates this responder's unit along the real road
// route from Malabe Bus Stand to CINEC Campus, for demoing live tracking
// without needing a real accident or real GPS. Injects a client-side-only
// "demo alert" into the dashboard's map data (never written to Firebase's
// alerts/ collection) so TrackingMap draws the route exactly as it would
// for a real incident; only the unit's position (units/{uid}) is written
// to Firebase, same as real tracking would.
export default function SimulateDropdown({ role, uid, onDemoAlertChange }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('idle') // idle | running | done
  const [remainingMs, setRemainingMs] = useState(DURATION_MS)
  const intervalRef = useRef(null)
  const routeRef = useRef(null)
  const startedAtRef = useRef(0)

  useEffect(() => () => stop(), []) // eslint-disable-line react-hooks/exhaustive-deps

  const demoAlert = {
    id: DEMO_ALERT_ID,
    lat: CINEC_CAMPUS.lat,
    lng: CINEC_CAMPUS.lng,
    address: 'CINEC Campus, Malabe',
    severity: 'high',
    accidentType: 'Live Tracking Demo',
    createdAt: Date.now(),
    policeStatus: 'en_route',
    ambulanceStatus: 'en_route',
  }

  const stop = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = null
  }

  const handleStart = async () => {
    setOpen(false)
    setStatus('running')
    setRemainingMs(DURATION_MS)
    onDemoAlertChange(demoAlert)

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
        uid, role, step.lat, step.lng, DEMO_ALERT_ID,
        MALABE_BUS_STAND.lat, MALABE_BUS_STAND.lng
      )
      const elapsed = Date.now() - startedAtRef.current
      setRemainingMs(Math.max(0, DURATION_MS - elapsed))
      if (step.done) {
        stop()
        setStatus('done')
      }
    }, TICK_MS)
  }

  const handleStop = () => {
    stop()
    setStatus('idle')
    setOpen(false)
    onDemoAlertChange(null)
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
          borderRadius: 'var(--radius-sm)', padding: '0.6rem', minWidth: '240px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            Live tracking demo
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
            Malabe Bus Stand → CINEC Campus, real road route, ~2 min.
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
