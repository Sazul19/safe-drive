const SERVICE_UUID        = '12345678-1234-1234-1234-123456789abc'
const CHARACTERISTIC_UUID = 'abcd1234-ab12-cd34-ef56-abcdef123456'

// Fallback location (CINEC Campus, Malabe, Sri Lanka) — used when real
// device geolocation isn't available.
const FALLBACK_LAT = 6.915423
const FALLBACK_LNG = 79.96052

// ── Cooldown ────────────────────────────────────────────────────────────────
// The firmware already runs its own on-device threshold + 3-reading-confirm +
// 60s cooldown classifier before it ever sends a BLE notify (see
// docs/ml/firmware-reference/AccidentDetector.ino) — this is just a lightweight
// client-side safety net against duplicate notify events (e.g. reconnect
// glitches), not a real classification gate.
const CRASH_COOLDOWN_MS = 3000;

// ── Filter state ────────────────────────────────────────────────────────────
let isInCooldown = false;        // True = ignore everything until cooldown expires

let bleDevice      = null
let onDisconnectCb = null
let receiveBuffer  = ''

// ── Geocode timeout ─────────────────────────────────────────────────────────
const GEOCODE_TIMEOUT_MS = 4000;

// ────────────────────────────────────────────────────────────────────────────
// Parses BLE JSON chunks and trusts the firmware's own MAJOR/MINOR
// classification (`type` field) rather than re-deriving it client-side.
//
// Previously this re-thresholded `magnitude` itself, which was wrong: the
// firmware never sends anything below its own MINOR_THRESHOLD (20.0 m/s²),
// so the old client-side "major" threshold of 20.0 was satisfied by nearly
// every message — including firmware-labeled MINOR ones — causing almost
// everything to be reported as MAJOR. See docs/ml/hardware-alignment-check.md
// §4 for the full root-cause writeup.
// ────────────────────────────────────────────────────────────────────────────
function handleChunk(chunk, onData) {
  receiveBuffer += chunk

  // Find first '{' — discard anything before it
  let startIdx = receiveBuffer.indexOf('{')
  if (startIdx === -1) { receiveBuffer = ''; return }
  if (startIdx > 0) receiveBuffer = receiveBuffer.substring(startIdx)

  // Find matching '}' via bracket depth
  let depth = 0, endIdx = -1
  for (let i = 0; i < receiveBuffer.length; i++) {
    if (receiveBuffer[i] === '{') depth++
    else if (receiveBuffer[i] === '}') { depth--; if (depth === 0) { endIdx = i; break } }
  }
  if (endIdx === -1) return // incomplete JSON, wait for more chunks

  const raw = receiveBuffer.substring(0, endIdx + 1)
  receiveBuffer = receiveBuffer.substring(endIdx + 1)

  let parsedData
  try { parsedData = JSON.parse(raw) }
  catch { console.warn('BLE: bad JSON:', raw); return }

  // ── Trust the firmware's classification ────────────────────────────────
  const type = parsedData.type
  if (type !== 'MAJOR' && type !== 'MINOR') {
    console.warn('BLE: missing/unrecognized type field, discarding:', raw)
    return
  }

  const mag = parseFloat(
    parsedData.magnitude ?? parsedData.mag ?? parsedData.g ??
    parsedData.acc ?? parsedData.force ?? parsedData.impact ?? 0
  )

  // ── Dedupe safety net (see comment above CRASH_COOLDOWN_MS) ───────────
  if (isInCooldown) {
    console.log(`📡 Cooldown active — discarding duplicate ${type} event (${(mag/9.81).toFixed(2)}G)`)
    return
  }

  console.log(`🚨 ${type} crash — firmware-classified at ${(mag/9.81).toFixed(2)}G`)
  onData({ ...parsedData, type, magnitude: mag })

  isInCooldown = true
  setTimeout(() => { isInCooldown = false }, CRASH_COOLDOWN_MS)
}

// ── Location helpers ────────────────────────────────────────────────────────
let cachedLocation = null
let watchId        = null

export function isBLESupported() {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator
}

export function isConnected() {
  return !!(bleDevice?.gatt?.connected)
}

export function startLocationWatch(onUpdate) {
  if (!navigator.geolocation) return
  cachedLocation = null
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      cachedLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      if (onUpdate) onUpdate(cachedLocation)
    },
    (err) => console.warn('Location watch error:', err),
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
  )
}

export function stopLocationWatch() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId)
    watchId = null
  }
  cachedLocation = null
}

export async function getBestLocation() {
  if (cachedLocation) return { ...cachedLocation, source: 'watch' }
  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
    })
    const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
    cachedLocation = loc
    return { ...loc, source: 'oneshot' }
  } catch {
    return { lat: FALLBACK_LAT, lng: FALLBACK_LNG, source: 'fallback' }
  }
}

// ── BLE connection ──────────────────────────────────────────────────────────
export async function connectToDevice(onData, onDisconnect) {
  onDisconnectCb = onDisconnect

  bleDevice = await navigator.bluetooth.requestDevice({
    filters: [{ name: 'AccidentDetector' }],
    optionalServices: [SERVICE_UUID],
  })

  let fullyConnected = false

  const handleDisconnect = async () => {
    if (!fullyConnected) return
    console.warn('BLE: disconnected — attempting reconnect…')

    for (let attempt = 1; attempt <= 3; attempt++) {
      await new Promise(r => setTimeout(r, attempt * 1000))
      if (!bleDevice) break
      try {
        const srv = await bleDevice.gatt.connect()
        const svc = await srv.getPrimaryService(SERVICE_UUID)
        const chr = await svc.getCharacteristic(CHARACTERISTIC_UUID)
        receiveBuffer = ''
        isInCooldown = false // reset filter state
        chr.addEventListener('characteristicvaluechanged', (event) => {
          handleChunk(new TextDecoder().decode(event.target.value), onData)
        })
        await chr.startNotifications()
        console.log(`BLE: reconnected on attempt ${attempt}`)
        return
      } catch (err) {
        console.warn(`BLE: reconnect attempt ${attempt} failed:`, err)
      }
    }
    bleDevice = null
    if (onDisconnectCb) onDisconnectCb()
  }

  bleDevice.addEventListener('gattserverdisconnected', handleDisconnect)

  const server  = await bleDevice.gatt.connect()
  const service = await server.getPrimaryService(SERVICE_UUID)
  const chr     = await service.getCharacteristic(CHARACTERISTIC_UUID)

  receiveBuffer = ''
  isInCooldown = false // clean state on fresh connect
  chr.addEventListener('characteristicvaluechanged', (event) => {
    handleChunk(new TextDecoder().decode(event.target.value), onData)
  })

  await chr.startNotifications()
  fullyConnected = true
  return bleDevice.name
}

export function disconnectDevice() {
  if (bleDevice?.gatt?.connected) bleDevice.gatt.disconnect()
  bleDevice = null
  // Reset filter state
  isInCooldown = false
}

// ── Timeout-protected reverse geocode ───────────────────────────────────────
export async function reverseGeocode(lat, lng) {
  const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS)
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'Accept-Language': 'en' }, signal: controller.signal }
    )
    clearTimeout(timeoutId)
    const data = await res.json()
    return data.display_name || fallback
  } catch (err) {
    console.warn('Geocode failed/timed out:', err.message)
    return fallback
  }
}