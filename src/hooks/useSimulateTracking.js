import { useState, useRef, useEffect } from 'react'
import { updateUnitLocation } from '../lib/tracking'
import { fetchRoute, routeLength, stepAlongRoute } from '../lib/routing'
import { addTestAlert, updateAlertStatus, deleteAlert } from '../lib/alerts'

const MALABE_BUS_STAND = { lat: 6.9039, lng: 79.9544 }
const CINEC_CAMPUS = { lat: 6.915423, lng: 79.96052 }
const DURATION_MS = 120000 // ~2 minutes, a believable urban response time
const TICK_MS = 1000

// Drives the Malabe Bus Stand → CINEC Campus live-tracking demo. Lives at
// the dashboard level (not inside the profile dropdown menu item that
// triggers it) so the running interval survives the dropdown opening and
// closing — the menu's contents unmount/remount each time it toggles, which
// would otherwise kill the simulation the moment the menu closes.
//
// Writes a real alert via addTestAlert() (tagged isTest: true, same
// mechanism the Sensor Test Screen uses) so every dashboard subscribed to
// the normal alerts/units feeds — Admin included — sees the same live
// tracking automatically, no extra wiring needed.
export function useSimulateTracking(role, uid) {
  const [status, setStatus] = useState('idle') // idle | running | done
  const [remainingMs, setRemainingMs] = useState(DURATION_MS)
  const intervalRef = useRef(null)
  const routeRef = useRef(null)
  const alertIdRef = useRef(null)
  const startedAtRef = useRef(0)

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current) }, [])

  const cleanupInterval = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = null
  }

  const start = async () => {
    if (!uid) return
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
        cleanupInterval()
        updateAlertStatus(alertId, role, 'arrived').catch(console.error)
        setStatus('done')
      }
    }, TICK_MS)
  }

  const stop = () => {
    cleanupInterval()
    setStatus('idle')
    if (alertIdRef.current) {
      deleteAlert(alertIdRef.current).catch(console.error)
      alertIdRef.current = null
    }
    updateUnitLocation(uid, role, MALABE_BUS_STAND.lat, MALABE_BUS_STAND.lng, null)
  }

  return { status, secondsLeft: Math.ceil(remainingMs / 1000), start, stop }
}
