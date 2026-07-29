import { useState, useCallback, useRef, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  isBLESupported, connectToDevice, disconnectDevice, getBestLocation, reverseGeocode
} from '../lib/ble'
import { addTestAlert } from '../lib/alerts'
import { playAlertSound } from '../lib/notifications'
import { isSandboxEnabled, setSandboxEnabled } from '../lib/sandbox'
import { SANDBOX_FIXTURES } from '../lib/sandboxFixtures'
import TestModeBanner from '../components/TestModeBanner'

// Standalone diagnostic screen — not linked from any nav, reached by typing
// the URL directly. Shows the raw BLE data stream (real or simulated) and
// lets you fire simulated MINOR/MAJOR events (from the shared fixture set
// in lib/sandboxFixtures.js) through the same playAlertSound()/addTestAlert()
// pipeline a real firmware event would use, so you can verify Admin/Police/
// Ambulance dashboards receive it correctly. Writes go into the same
// alerts/ collection as a real event, tagged isTest: true — see
// docs/testing/sandbox-methodology.md. Gated behind the sandbox flag.
//
// MINOR events go through the same driver-facing confirmation flow as the
// real UserDashboard (a countdown sheet with "I'm fine"/"Send alert now"),
// not an instant write — so this screen exercises the actual UX a driver
// would see, not just the backend pipeline. MAJOR still fires immediately,
// matching real behavior (no confirmation step for a major impact).

const COUNTDOWN_SECONDS = 180

const palette = {
  bg: '#070a13',
  surface: '#0f1425',
  primary: '#3b82f6',
  primarySoft: 'rgba(59, 130, 246, 0.12)',
  safe: '#10b981',
  safeSoft: 'rgba(16, 185, 129, 0.12)',
  warn: '#f59e0b',
  warnSoft: 'rgba(245, 158, 11, 0.12)',
  danger: '#ef4444',
  dangerSoft: 'rgba(239, 68, 68, 0.12)',
  text: '#f8fafc',
  textMuted: '#64748b',
  border: 'rgba(255, 255, 255, 0.08)',
}

const btnStyle = (color, soft) => ({
  padding: '10px 16px',
  borderRadius: '10px',
  border: `1px solid ${color}`,
  background: soft,
  color,
  fontWeight: 700,
  fontSize: '0.85rem',
  cursor: 'pointer',
})

function loadJSON(key, fallback) {
  try {
    const saved = localStorage.getItem(key)
    return saved ? JSON.parse(saved) : fallback
  } catch { return fallback }
}

export default function SensorTestScreen() {
  const { user } = useAuth()
  const [sandboxEnabled, setSandboxEnabledState] = useState(isSandboxEnabled())

  const handleEnableSandbox = () => {
    setSandboxEnabled(true)
    setSandboxEnabledState(true)
  }

  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState('')
  const [log, setLog] = useState([])
  const logIdRef = useRef(0)

  // Mirrors UserDashboard's pending-confirmation flow for MINOR events.
  const [pendingAlert, setPendingAlert] = useState(null) // { logId, payload }
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)

  // Read-only reuse of the same profile/contacts the real UserDashboard
  // saves, so simulated alerts carry realistic medicalProfile/emergencyContacts.
  const profile = loadJSON('safedrive_profile', {})
  const contacts = loadJSON('safedrive_contacts', [])

  const appendLog = (entry) => {
    const id = ++logIdRef.current
    setLog(prev => [{ id, time: Date.now(), ...entry }, ...prev].slice(0, 200))
    return id
  }

  const updateLog = (id, patch) => {
    setLog(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
  }

  // Actually writes to Firebase — called immediately for MAJOR, or later
  // (on confirm/timeout/cancel) for MINOR, mirroring UserDashboard's flow.
  const sendAlert = async (logId, payload) => {
    try {
      const alertId = await addTestAlert(payload)
      updateLog(logId, { sent: true, alertId })
    } catch (err) {
      updateLog(logId, { error: err.message || 'Failed to process' })
    }
  }

  // Shared by both real BLE notifications and the simulate buttons.
  const handleData = useCallback(async (data, source) => {
    const id = appendLog({ source, raw: data, sent: false })

    try {
      const mag = parseFloat(data.magnitude || data.mag || data.g || 0)
      const impactG = (mag / 9.81).toFixed(1)
      let lat = null, lng = null, address = 'Unknown'
      try {
        const loc = await getBestLocation()
        lat = loc.lat; lng = loc.lng
        address = await reverseGeocode(lat, lng)
      } catch { /* fall through with defaults */ }

      const payload = {
        severity: data.type === 'MAJOR' ? 'critical' : 'high',
        accidentType: data.type === 'MAJOR' ? 'Major collision detected (TEST)' : 'Minor impact detected (TEST)',
        lat, lng, address,
        createdAt: Date.now(),
        vehicleId: (user?.uid || 'unknown') + ' (TEST)',
        impactForce: impactG,
        // Firebase's set() rejects any payload containing `undefined` —
        // profile fields are undefined (not null) when no medical profile
        // has ever been saved, so default each one explicitly.
        medicalProfile: {
          bloodType: profile.bloodType ?? null,
          allergies: profile.allergies ?? null,
          conditions: profile.conditions ?? null,
        },
        emergencyContacts: contacts,
      }

      playAlertSound()

      if (data.type === 'MAJOR') {
        // Real flow: MAJOR escalates immediately, no confirmation step.
        await sendAlert(id, payload)
      } else {
        // Real flow: MINOR waits for driver confirmation or a 3-minute
        // countdown timeout — same as UserDashboard's bottom sheet.
        updateLog(id, { pending: true })
        setPendingAlert({ logId: id, payload })
      }
    } catch (err) {
      updateLog(id, { error: err.message || 'Failed to process' })
    }
  }, [user, profile, contacts])

  useEffect(() => {
    if (!pendingAlert) return
    setCountdown(COUNTDOWN_SECONDS)
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          setPendingAlert(current => {
            if (current) sendAlert(current.logId, current.payload)
            return null
          })
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [pendingAlert])

  // Repeating siren while awaiting confirmation — same rationale as
  // UserDashboard: a single burst is easy to miss.
  useEffect(() => {
    if (!pendingAlert) return
    const siren = setInterval(() => playAlertSound(), 5000)
    return () => clearInterval(siren)
  }, [pendingAlert])

  const handleConfirmSend = () => {
    if (!pendingAlert) return
    sendAlert(pendingAlert.logId, pendingAlert.payload)
    setPendingAlert(null)
  }

  const handleCancelPending = () => {
    if (!pendingAlert) return
    updateLog(pendingAlert.logId, { pending: false, cancelled: true })
    setPendingAlert(null)
  }

  const handleConnect = async () => {
    try {
      setStatus('Scanning for devices...')
      await connectToDevice(
        (data) => handleData(data, 'ble'),
        () => { setConnected(false); setStatus('Disconnected') }
      )
      setConnected(true)
      setStatus('Connected')
    } catch (err) {
      setStatus(err.message || 'Connection failed')
      setConnected(false)
    }
  }

  const handleDisconnect = () => {
    disconnectDevice()
    setConnected(false)
    setStatus('')
  }

  const simulate = (fixture) => {
    if (!connected) return // guard against a stale/bypassed disabled state
    handleData(fixture.payload, `simulated:${fixture.id}`)
  }

  // Fixtures marked simulatable: false only exercise firmware-side or
  // ble.js-parser logic this screen bypasses by calling the data handler
  // directly — documented in lib/sandboxFixtures.js but not wired to a
  // button here (see docs/testing/sandbox-methodology.md).
  const simulatableFixtures = SANDBOX_FIXTURES.filter(f => f.simulatable !== false)

  if (!sandboxEnabled) {
    return (
      <div style={{ minHeight: '100dvh', background: palette.bg, color: palette.text, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif", padding: '20px', textAlign: 'center' }}>
        <p style={{ color: palette.textMuted, margin: 0 }}>Sandbox testing is disabled on this device.</p>
        <button style={btnStyle(palette.primary, palette.primarySoft)} onClick={handleEnableSandbox}>
          Enable Sandbox Mode
        </button>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', background: palette.bg }}>
      <TestModeBanner />
      <div style={{
        color: palette.text,
        fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif",
        maxWidth: '600px', margin: '0 auto', padding: '20px 16px 60px',
      }}>
      <h1 style={{ fontSize: '1.3rem', fontWeight: 800, margin: '0 0 4px' }}>Sensor Test Screen</h1>
      <p style={{ color: palette.textMuted, fontSize: '0.85rem', margin: '0 0 20px' }}>
        Diagnostic tool — connects to the real BLE sensor and/or fires simulated events. Both go through the real alert pipeline (sound + Firebase, tagged isTest: true).
      </p>

      {/* Connection controls */}
      <div style={{ background: palette.surface, border: `1px solid ${palette.border}`, borderRadius: '14px', padding: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
            {connected ? '🟢 Connected' : '⚪ Not connected'}
          </span>
          {status && <span style={{ color: palette.textMuted, fontSize: '0.8rem' }}>{status}</span>}
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {!connected ? (
            <button style={btnStyle(palette.primary, palette.primarySoft)} onClick={handleConnect}>
              Scan &amp; Connect
            </button>
          ) : (
            <button style={btnStyle(palette.danger, palette.dangerSoft)} onClick={handleDisconnect}>
              Disconnect
            </button>
          )}
        </div>

        {!isBLESupported() && (
          <p style={{ marginTop: '10px', fontSize: '0.78rem', color: palette.danger }}>
            Web Bluetooth not supported on this browser — connecting (and therefore simulation) isn't possible here.
          </p>
        )}
      </div>

      {/* Simulate controls — driven by the shared fixture set. Gated behind
          a real BLE connection: this screen validates the pipeline once a
          genuine device session is active, not as a hardware-free shortcut. */}
      <div style={{ background: palette.surface, border: `1px solid ${palette.border}`, borderRadius: '14px', padding: '16px', marginBottom: '20px' }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '4px' }}>Simulate</div>
        <p style={{ color: palette.textMuted, fontSize: '0.78rem', margin: '0 0 12px' }}>
          {connected
            ? 'Scenarios from lib/sandboxFixtures.js — each fires the exact same payload every time, for repeatable testing.'
            : 'Connect to the sensor above first — simulation is disabled until a device is connected.'}
        </p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {simulatableFixtures.map(fixture => {
            const isMajor = fixture.payload.type === 'MAJOR'
            return (
              <button
                key={fixture.id}
                title={connected ? fixture.description : 'Connect to the sensor first'}
                disabled={!connected}
                style={{
                  ...btnStyle(isMajor ? palette.danger : palette.warn, isMajor ? palette.dangerSoft : palette.warnSoft),
                  opacity: connected ? 1 : 0.4,
                  cursor: connected ? 'pointer' : 'not-allowed',
                }}
                onClick={() => simulate(fixture)}
              >
                {isMajor ? '🚨' : '⏳'} {fixture.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Live data stream */}
      <div style={{ background: palette.surface, border: `1px solid ${palette.border}`, borderRadius: '14px', padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Data Stream ({log.length})</span>
          {log.length > 0 && (
            <button
              style={{ ...btnStyle(palette.textMuted, 'transparent'), padding: '4px 10px', fontSize: '0.75rem' }}
              onClick={() => setLog([])}
            >
              Clear
            </button>
          )}
        </div>

        {log.length === 0 ? (
          <p style={{ color: palette.textMuted, fontSize: '0.85rem', margin: 0 }}>
            No data yet — connect a real sensor or use a Simulate button above.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '55vh', overflowY: 'auto' }}>
            {log.map(entry => (
              <div key={entry.id} style={{
                border: `1px solid ${palette.border}`, borderRadius: '10px', padding: '10px 12px',
                fontFamily: "'JetBrains Mono', 'SFMono-Regular', Consolas, monospace", fontSize: '0.78rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{
                    fontWeight: 700,
                    color: entry.raw?.type === 'MAJOR' ? palette.danger : entry.raw?.type === 'MINOR' ? palette.warn : palette.text,
                  }}>
                    {entry.raw?.type || 'UNKNOWN'}
                  </span>
                  <span style={{ color: palette.textMuted }}>
                    {new Date(entry.time).toLocaleTimeString()} · {entry.source}
                  </span>
                </div>
                <div style={{ color: palette.textMuted, wordBreak: 'break-all' }}>
                  {JSON.stringify(entry.raw)}
                </div>
                <div style={{ marginTop: '4px' }}>
                  {entry.error ? (
                    <span style={{ color: palette.danger }}>✖ {entry.error}</span>
                  ) : entry.sent ? (
                    <span style={{ color: palette.safe }}>✓ Sent to Firebase{entry.alertId ? ` (${entry.alertId})` : ''}</span>
                  ) : entry.cancelled ? (
                    <span style={{ color: palette.textMuted }}>Cancelled by driver — never sent</span>
                  ) : entry.pending ? (
                    <span style={{ color: palette.warn }}>⏳ Awaiting driver confirmation…</span>
                  ) : (
                    <span style={{ color: palette.textMuted }}>Sending…</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>

      {/* Real-UI confirmation sheet for MINOR — identical flow to
          UserDashboard's bottom sheet, so this screen exercises the actual
          driver-facing UX, not just a backend shortcut. */}
      {pendingAlert && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50,
        }}>
          <div style={{
            background: palette.surface, border: `1px solid ${palette.border}`,
            borderRadius: '20px 20px 0 0', padding: '24px 20px', width: '100%', maxWidth: '480px',
            fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif",
          }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '50%',
                backgroundColor: palette.warnSoft, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 12px', fontSize: '1.8rem',
              }}>⚠️</div>
              <h2 style={{ margin: '0 0 6px', fontSize: '1.3rem', fontWeight: 800, color: palette.warn }}>Impact Detected</h2>
              <p style={{ margin: 0, color: palette.textMuted, fontSize: '0.9rem' }}>
                {pendingAlert.payload.impactForce}G at {pendingAlert.payload.address?.split(',')[0] || 'your location'}
              </p>
            </div>

            <div style={{ height: '6px', backgroundColor: palette.border, borderRadius: '3px', marginBottom: '6px', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: '3px',
                backgroundColor: countdown <= 10 ? palette.danger : palette.warn,
                width: `${(countdown / COUNTDOWN_SECONDS) * 100}%`,
                transition: 'width 1s linear',
              }}/>
            </div>
            <p style={{ textAlign: 'center', margin: '0 0 20px', fontSize: '0.85rem', color: palette.textMuted }}>
              Sending alert in{' '}
              <strong style={{ color: countdown <= 10 ? palette.danger : palette.text, fontSize: '1rem' }}>
                {countdown}s
              </strong>
            </p>

            <button onClick={handleCancelPending} style={{
              ...btnStyle(palette.border, 'transparent'), color: palette.text, width: '100%', marginBottom: '10px', padding: '12px',
            }}>
              I'm fine — cancel
            </button>
            <button onClick={handleConfirmSend} style={{
              ...btnStyle(palette.danger, palette.danger), color: '#fff', width: '100%', padding: '12px',
            }}>
              Send alert now
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
