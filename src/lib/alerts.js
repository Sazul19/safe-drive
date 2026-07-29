import { ref, onValue, set, push, get, remove } from 'firebase/database'
import { db } from '../firebase'

const ALERTS_PATH = 'alerts'

export function alertsRef() {
  return ref(db, ALERTS_PATH)
}

// Firebase Realtime Database's special `.info/connected` path reflects the
// client's actual live connection state — use this instead of assuming
// "connected" just because the app rendered.
export function subscribeConnectionState(callback) {
  return onValue(ref(db, '.info/connected'), (snapshot) => {
    callback(snapshot.val() === true)
  })
}

export function subscribeAlerts(callback) {
  return onValue(alertsRef(), (snapshot) => {
    const data = snapshot.val()
    const list = data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : []
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    callback(list)
  })
}

const DEMO_LOCATIONS = [
  { address: 'Galle Road, Colombo 03', lat: 6.8928, lng: 79.8513 },
  { address: 'Kandy Road, Kelaniya', lat: 7.0000, lng: 79.9214 },
  { address: 'High Level Road, Nugegoda', lat: 6.8725, lng: 79.8994 },
  { address: 'Baseline Road, Dematagoda', lat: 6.9398, lng: 79.8736 },
  { address: 'Negombo Road, Wattala', lat: 6.9896, lng: 79.8915 },
]

const SEVERITIES = ['critical', 'high', 'medium', 'low']
const ACCIDENT_TYPES = [
  'Head-on collision',
  'Side-impact crash',
  'Rear-end collision',
  'Rollover accident',
  'Multi-vehicle pile-up',
]

function buildAlertPayload(alert) {
  const loc = DEMO_LOCATIONS[Math.floor(Math.random() * DEMO_LOCATIONS.length)]
  const severity = SEVERITIES[Math.floor(Math.random() * SEVERITIES.length)]
  const accidentType = ACCIDENT_TYPES[Math.floor(Math.random() * ACCIDENT_TYPES.length)]

  return {
    vehicleId: alert.vehicleId || 'Smart Vehicle',
    lat: alert.lat || loc.lat,
    lng: alert.lng || loc.lng,
    address: alert.address || loc.address,
    createdAt: Date.now(),
    policeStatus: 'pending',
    ambulanceStatus: 'pending',
    severity: alert.severity || severity,
    accidentType: alert.accidentType || accidentType,
    speed: alert.speed || Math.floor(40 + Math.random() * 100),
    impactForce: alert.impactForce || (2 + Math.random() * 10).toFixed(1),
    // Passed through from the driver's own profile/contacts (UserDashboard)
    // so Ambulance responders can see it — null/[] for alerts that don't
    // originate from a driver with a saved profile (e.g. Admin sandbox/IoT).
    medicalProfile: alert.medicalProfile || null,
    emergencyContacts: alert.emergencyContacts || [],
  }
}

export function addAlert(alert) {
  const r = push(ref(db, ALERTS_PATH))
  set(r, buildAlertPayload(alert))
  return r.key
}

// Writes into the same alerts/ collection as addAlert (see
// docs/testing/sandbox-methodology.md) — tagged isTest: true so the UI can
// still visually distinguish it, but it appears in the normal live feed
// like any other alert, no separate toggle needed.
export function addTestAlert(alert) {
  const r = push(ref(db, ALERTS_PATH))
  set(r, { ...buildAlertPayload(alert), isTest: true })
  return r.key
}

export function updateAlertStatus(alertId, role, status) {
  const r = ref(db, `${ALERTS_PATH}/${alertId}`)
  return get(r).then((snapshot) => {
    const data = snapshot.val()
    if (!data) throw new Error('Alert not found')
    const key = role === 'police' ? 'policeStatus' : 'ambulanceStatus'
    const atKey = role === 'police' ? 'policeStatusAt' : 'ambulanceStatusAt'
    return set(r, { ...data, [key]: status, [atKey]: Date.now() })
  })
}

export function logAlertDeletion(alertId, deletedByUid, alertData) {
  const r = ref(db, `auditLog/deletedAlerts/${alertId}`)
  return set(r, {
    alertId,
    deletedBy: deletedByUid || 'unknown',
    deletedAt: Date.now(),
    snapshot: alertData,
  })
}

export const STATUS_LABELS = {
  pending: 'Not responded',
  en_route: 'En route',
  arrived: 'Arrived',
}

export const SEVERITY_LABELS = {
  critical: '🔴 Critical',
  high: '🟠 High',
  medium: '🟡 Medium',
  low: '🟢 Low',
}

export function deleteAlert(alertId) {
  const r = ref(db, `${ALERTS_PATH}/${alertId}`)
  return remove(r)
}
