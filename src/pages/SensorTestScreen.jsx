import { useState, useCallback, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  isBLESupported, connectToDevice, disconnectDevice, getBestLocation, reverseGeocode
} from '../lib/ble'
import { addAlert } from '../lib/alerts'
import { playAlertSound } from '../lib/notifications'

// Standalone diagnostic screen — not linked from any nav, reached by typing
// the URL directly. Shows the raw BLE data stream (real or simulated) and
// lets you fire simulated MINOR/MAJOR events through the exact same
// addAlert()/playAlertSound() pipeline a real firmware event would use, so
// you can verify Admin/Police/Ambulance dashboards receive it correctly.
// Gated behind VITE_ENABLE_SANDBOX, same as the other test tooling.

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
  const sandboxEnabled = import.meta.env.VITE_ENABLE_SANDBOX === 'true'

  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState('')
  const [log, setLog] = useState([])
  const logIdRef = useRef(0)

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

  // Shared by both real BLE notifications and the simulate buttons, so the
  // log and Firebase write behave identically regardless of data source.
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

      playAlertSound()

      const payload = {
        severity: data.type === 'MAJOR' ? 'critical' : 'high',
        accidentType: data.type === 'MAJOR' ? 'Major collision detected (TEST)' : 'Minor impact detected (TEST)',
        lat, lng, address,
        createdAt: Date.now(),
        vehicleId: (user?.uid || 'unknown') + ' (TEST)',
        impactForce: impactG,
        medicalProfile: {
          bloodType: profile.bloodType, allergies: profile.allergies, conditions: profile.conditions,
        },
        emergencyContacts: contacts,
      }

      const alertId = await addAlert(payload)
      updateLog(id, { sent: true, alertId })
    } catch (err) {
      updateLog(id, { error: err.message || 'Failed to process' })
    }
  }, [user, profile, contacts])

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

  const simulate = (type) => {
    handleData({ type, magnitude: type === 'MAJOR' ? '38.45' : '22.10', gps: 'phone' }, 'simulated')
  }

  if (!sandboxEnabled) {
    return (
      <div style={{ minHeight: '100dvh', background: palette.bg, color: palette.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif" }}>
        <p style={{ color: palette.textMuted }}>Sandbox testing is disabled (VITE_ENABLE_SANDBOX is not set).</p>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100dvh', background: palette.bg, color: palette.text,
      fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif",
      maxWidth: '600px', margin: '0 auto', padding: '20px 16px 60px',
    }}>
      <h1 style={{ fontSize: '1.3rem', fontWeight: 800, margin: '0 0 4px' }}>Sensor Test Screen</h1>
      <p style={{ color: palette.textMuted, fontSize: '0.85rem', margin: '0 0 20px' }}>
        Diagnostic tool — connects to the real BLE sensor and/or fires simulated events. Both go through the real alert pipeline (sound + Firebase), tagged "(TEST)".
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
            Web Bluetooth not supported on this browser — simulate buttons below still work.
          </p>
        )}
      </div>

      {/* Simulate controls */}
      <div style={{ background: palette.surface, border: `1px solid ${palette.border}`, borderRadius: '14px', padding: '16px', marginBottom: '20px' }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '12px' }}>Simulate</div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button style={btnStyle(palette.warn, palette.warnSoft)} onClick={() => simulate('MINOR')}>
            ⏳ Simulate Minor
          </button>
          <button style={btnStyle(palette.danger, palette.dangerSoft)} onClick={() => simulate('MAJOR')}>
            🚨 Simulate Major
          </button>
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
  )
}
