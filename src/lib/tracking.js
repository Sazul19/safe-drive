import { ref, onValue, set, off } from 'firebase/database'
import { db } from '../firebase'

const UNITS_PATH = 'units'

export function updateUnitLocation(uid, role, lat, lng, alertId = null, startLat = null, startLng = null) {
  if (!uid) return
  const r = ref(db, `${UNITS_PATH}/${uid}`)
  const payload = {
    role,
    lat,
    lng,
    alertId,
    lastUpdate: Date.now()
  }
  if (startLat !== null) payload.startLat = startLat
  if (startLng !== null) payload.startLng = startLng
  return set(r, payload)
}

export function subscribeUnitLocations(callback) {
  const r = ref(db, UNITS_PATH)
  const unsub = onValue(r, (snapshot) => {
    const data = snapshot.val()
    const list = data ? Object.entries(data).map(([uid, v]) => ({ uid, ...v })) : []
    callback(list)
  })
  return () => off(r, 'value', unsub)
}
