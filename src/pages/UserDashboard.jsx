import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  isBLESupported, connectToDevice, disconnectDevice,
  startLocationWatch, stopLocationWatch, getBestLocation, reverseGeocode
} from '../lib/ble'
import { addAlert } from '../lib/alerts'
import { playAlertSound } from '../lib/notifications'

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const COUNTDOWN_SECONDS = 180
const TABS = ['home', 'contacts', 'history', 'profile']

// ─── STYLES ──────────────────────────────────────────────────────────────────
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

const S = {
  shell: {
    minHeight: '100dvh',
    backgroundColor: palette.bg,
    fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif",
    color: palette.text,
    maxWidth: '430px',
    margin: '0 auto',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 0 50px rgba(0, 0, 0, 0.8)',
  },
  header: {
    position: 'sticky',
    top: 0,
    backgroundColor: 'rgba(15, 20, 37, 0.85)',
    backdropFilter: 'blur(10px)',
    padding: '16px 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: `1px solid ${palette.border}`,
    zIndex: 20,
  },
  main: {
    flex: 1,
    padding: '18px 16px 100px',
    overflowY: 'auto',
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: '16px',
    padding: '20px',
    marginBottom: '14px',
    border: `1px solid ${palette.border}`,
    boxShadow: 'inset 0 0 16px rgba(255, 255, 255, 0.01)',
  },
  label: {
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: palette.textMuted,
    marginBottom: '8px',
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    fontSize: '0.95rem',
    border: `1.5px solid ${palette.border}`,
    borderRadius: '10px',
    backgroundColor: '#131b31',
    color: palette.text,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'all 0.2s ease',
  },
  btnPrimary: {
    width: '100%',
    padding: '14px',
    fontSize: '1rem',
    fontWeight: 800,
    color: '#fff',
    background: 'linear-gradient(135deg, var(--primary, #3b82f6) 0%, #1d4ed8 100%)',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
  },
  btnDanger: {
    width: '100%',
    padding: '14px',
    fontSize: '1rem',
    fontWeight: 800,
    color: '#fff',
    background: 'linear-gradient(135deg, var(--danger, #ef4444) 0%, #b91c1c 100%)',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
  },
  btnOutline: {
    width: '100%',
    padding: '12px',
    fontSize: '0.95rem',
    fontWeight: 700,
    color: palette.primary,
    backgroundColor: 'transparent',
    border: `1.5px solid ${palette.primary}`,
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  btnGhost: {
    padding: '8px 14px',
    fontSize: '0.82rem',
    fontWeight: 700,
    color: palette.danger,
    backgroundColor: palette.dangerSoft,
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  tabBar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15, 20, 37, 0.85)',
    backdropFilter: 'blur(12px)',
    borderTop: `1px solid ${palette.border}`,
    display: 'flex',
    justifyContent: 'space-around',
    padding: '8px 0 env(safe-area-inset-bottom, 8px)',
    maxWidth: '430px',
    margin: '0 auto',
    zIndex: 20,
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(7, 10, 19, 0.75)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'flex-end',
    justifycontent: 'center',
    zIndex: 100,
  },
  sheet: {
    backgroundColor: palette.surface,
    width: '100%',
    maxWidth: '430px',
    borderTopLeftRadius: '24px',
    borderTopRightRadius: '24px',
    padding: '28px 20px 36px',
    animation: 'sheetUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
    border: `1px solid ${palette.border}`,
    borderBottom: 'none',
  },
}

// ─── TAB ICON COMPONENT ──────────────────────────────────────────────────────
function TabIcon({ tab, active }) {
  const icons = {
    home: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? palette.primary : palette.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
    contacts: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? palette.primary : palette.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
      </svg>
    ),
    history: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? palette.primary : palette.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
    profile: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? palette.primary : palette.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  }
  return icons[tab] || null
}

// ─── ONBOARDING COMPONENT ────────────────────────────────────────────────────
function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0)

  const steps = [
    { icon: '🛡️', title: 'Welcome to SafeDrive', desc: 'Your personal accident detection and emergency response system. We monitor your vehicle and call for help when you need it.' },
    { icon: '📡', title: 'Connect Your Sensor', desc: 'Pair your vehicle\'s Bluetooth crash sensor to enable real-time impact monitoring while you drive.' },
    { icon: '👥', title: 'Add Emergency Contacts', desc: 'Choose who gets notified immediately when an accident is detected. You can add up to 5 trusted people.' },
    { icon: '🏥', title: 'Medical Profile', desc: 'Your blood type, allergies, and conditions can be shared with first responders to save critical time.' },
  ]

  const s = steps[step]
  const isLast = step === steps.length - 1

  return (
    <div style={{ ...S.shell, justifyContent: 'center', padding: '32px 24px' }}>
      <div style={{ textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontSize: '4.5rem', marginBottom: '24px' }}>{s.icon}</div>
        <h1 style={{ margin: '0 0 12px', fontSize: '1.6rem', fontWeight: 800, lineHeight: 1.2 }}>{s.title}</h1>
        <p style={{ margin: '0 auto 40px', color: palette.textMuted, fontSize: '1rem', lineHeight: 1.6, maxWidth: '300px' }}>{s.desc}</p>

        {/* Dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '40px' }}>
          {steps.map((_, i) => (
            <div key={i} style={{
              width: i === step ? '24px' : '8px', height: '8px', borderRadius: '4px',
              backgroundColor: i === step ? palette.primary : palette.border,
              transition: 'all 0.25s ease',
            }}/>
          ))}
        </div>
      </div>

      <button
        style={S.btnPrimary}
        onClick={() => isLast ? onComplete() : setStep(step + 1)}
      >
        {isLast ? 'Get Started' : 'Next'}
      </button>
      {!isLast && (
        <button
          style={{ ...S.btnOutline, marginTop: '10px', border: 'none', color: palette.textMuted }}
          onClick={onComplete}
        >
          Skip intro
        </button>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function UserDashboard({ onLogout }) {
  const { user } = useAuth()

  // ── Onboarding ─────────────────────────────────────────────────────────────
  const [onboarded, setOnboarded] = useState(() => {
    try { return localStorage.getItem('safedrive_onboarded') === '1' } catch { return false }
  })
  const completeOnboarding = () => {
    try { localStorage.setItem('safedrive_onboarded', '1') } catch {}
    setOnboarded(true)
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('home')

  // ── BLE & Location ─────────────────────────────────────────────────────────
  const [bleConnected, setBleConnected] = useState(false)
  const [bleStatus, setBleStatus] = useState('')
  const [currentAddress, setCurrentAddress] = useState('Acquiring location...')
  const [lastDataTime, setLastDataTime] = useState(null)

  // ── Alert states ───────────────────────────────────────────────────────────
  const [pendingAlert, setPendingAlert] = useState(null)
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)
  const [systemStatus, setSystemStatus] = useState('idle')
  const [alertSentInfo, setAlertSentInfo] = useState(null)

  // ── Emergency Contacts ─────────────────────────────────────────────────────
  const [contacts, setContacts] = useState(() => {
    try {
      const saved = localStorage.getItem('safedrive_contacts')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [editingContact, setEditingContact] = useState(null) // null | { name, phone, relation }
  const [showContactForm, setShowContactForm] = useState(false)

  useEffect(() => {
    try { localStorage.setItem('safedrive_contacts', JSON.stringify(contacts)) } catch {}
  }, [contacts])

  // ── Alert History ──────────────────────────────────────────────────────────
  const [alertHistory, setAlertHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('safedrive_history')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })

  useEffect(() => {
    try { localStorage.setItem('safedrive_history', JSON.stringify(alertHistory)) } catch {}
  }, [alertHistory])

  const addToHistory = (alert, outcome) => {
    setAlertHistory(prev => [{
      ...alert, outcome, id: Date.now(),
      contactsNotified: contacts.length,
    }, ...prev].slice(0, 50))
  }

  // ── User Profile ───────────────────────────────────────────────────────────
  const [profile, setProfile] = useState(() => {
    try {
      const saved = localStorage.getItem('safedrive_profile')
      return saved ? JSON.parse(saved) : {
        displayName: '', bloodType: '', allergies: '', conditions: '',
        vehicleMake: '', vehicleModel: '', vehiclePlate: '',
      }
    } catch {
      return { displayName: '', bloodType: '', allergies: '', conditions: '', vehicleMake: '', vehicleModel: '', vehiclePlate: '' }
    }
  })

  useEffect(() => {
    try { localStorage.setItem('safedrive_profile', JSON.stringify(profile)) } catch {}
  }, [profile])

  // Attached to every outgoing alert so Ambulance responders can see the
  // victim's medical info and who to notify — previously this data never
  // left localStorage (see docs/features/ambulance-dashboard.md §4).
  const buildResponderPayload = () => ({
    medicalProfile: {
      bloodType: profile.bloodType,
      allergies: profile.allergies,
      conditions: profile.conditions,
    },
    emergencyContacts: contacts,
  })

  // ── Countdown Timer (FIXED: uses COUNTDOWN_SECONDS consistently) ──────────
  useEffect(() => {
    if (!pendingAlert) return
    setCountdown(COUNTDOWN_SECONDS)
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          handleAutoAlert()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [pendingAlert])

  // ── Continuous Location Tracking ───────────────────────────────────────────
  useEffect(() => {
    if (!bleConnected) return
    const updateAddress = async (loc) => {
      try {
        const addr = await reverseGeocode(loc.lat, loc.lng)
        setCurrentAddress(addr)
      } catch {
        setCurrentAddress(`${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`)
      }
    }
    startLocationWatch(updateAddress)
    return () => stopLocationWatch()
  }, [bleConnected])

  // ── Core BLE Data Handler ──────────────────────────────────────────────────
  const handleBLEData = useCallback(async (data) => {
    setLastDataTime(Date.now())
    try {
      let lat = parseFloat(data.lat)
      let lng = parseFloat(data.lng)
      const deviceHasFix = data.gps === 'device' && lat !== 0 && lng !== 0

      if (!deviceHasFix) {
        const loc = await getBestLocation()
        lat = loc.lat; lng = loc.lng
      }

      const address = await reverseGeocode(lat, lng)
      const mag = parseFloat(data.magnitude || data.mag || data.g || 0)
      const impactG = (mag / 9.81).toFixed(1)
      const isMajor = data.type === 'MAJOR'

      const payload = {
        severity: isMajor ? 'critical' : 'high',
        accidentType: isMajor ? 'Major collision detected' : 'Minor impact detected',
        lat, lng, address, impactForce: impactG,
        createdAt: Date.now(),
        vehicleId: user?.uid || 'Unknown Vehicle',
        ...buildResponderPayload(),
      }

      if (isMajor) {
        playAlertSound()
        await addAlert(payload)
        addToHistory(payload, 'auto-sent')
        setAlertSentInfo({ type: 'major', contactsNotified: contacts.length, time: Date.now() })
        setSystemStatus('major')
      } else {
        playAlertSound()
        setPendingAlert(payload)
      }
    } catch (error) {
      console.error('Processing failed:', error)
    }
  }, [user, contacts, profile])

  // ── Alert Action Handlers ──────────────────────────────────────────────────
  const handleAutoAlert = async () => {
    if (pendingAlert) {
      await addAlert(pendingAlert)
      addToHistory(pendingAlert, 'auto-sent (timeout)')
      setAlertSentInfo({ type: 'minor-auto', contactsNotified: contacts.length, time: Date.now() })
      setSystemStatus('alerting')
      setPendingAlert(null)
    }
  }

  const handleUserYes = async () => {
    if (pendingAlert) {
      await addAlert(pendingAlert)
      addToHistory(pendingAlert, 'user-confirmed')
      setAlertSentInfo({ type: 'minor-confirmed', contactsNotified: contacts.length, time: Date.now() })
      setSystemStatus('alerting')
      setPendingAlert(null)
    }
  }

  const handleUserNo = () => {
    if (pendingAlert) addToHistory(pendingAlert, 'cancelled')
    setPendingAlert(null)
    setSystemStatus('cancelled')
    setTimeout(() => setSystemStatus('idle'), 3000)
  }

  const handleManualSOS = async () => {
    const loc = await getBestLocation()
    const address = await reverseGeocode(loc.lat, loc.lng)
    const payload = {
      severity: 'critical', accidentType: 'Manual SOS',
      lat: loc.lat, lng: loc.lng, address,
      impactForce: '0.0', createdAt: Date.now(),
      vehicleId: user?.uid || 'Unknown Vehicle',
      ...buildResponderPayload(),
    }
    await addAlert(payload)
    addToHistory(payload, 'manual-sos')
    setAlertSentInfo({ type: 'sos', contactsNotified: contacts.length, time: Date.now() })
    setSystemStatus('alerting')
  }

  const dismissEmergency = () => {
    if (!window.confirm('Are you sure this was a false alarm? Emergency responders may have already been dispatched.')) return
    setSystemStatus('idle')
    setAlertSentInfo(null)
  }

  // ── BLE Connection Handlers ────────────────────────────────────────────────
  const handleBLEConnect = async () => {
    try {
      setBleStatus('Scanning for devices...')
      await connectToDevice(handleBLEData, () => {
        setBleConnected(false); setBleStatus('')
      })
      setBleConnected(true)
      setBleStatus('')
    } catch (err) {
      setBleStatus(err.message || 'Connection failed')
      setBleConnected(false)
    }
  }

  const handleBLEDisconnect = () => {
    disconnectDevice()
    setBleConnected(false); setBleStatus(''); setLastDataTime(null)
  }

  // Dev/demo aids — simulate the sensor without real hardware, so the full
  // "connected" production UI (location, sensor health, SOS button) and the
  // minor/major confirmation flow can both be tested standalone. Gated
  // behind VITE_ENABLE_SANDBOX, same pattern as Admin's Presentation
  // Sandbox (see docs/features/admin-dashboard.md §5) — hidden by default
  // in every build, including production.
  const handleTestConnect = () => {
    setBleStatus('')
    setBleConnected(true)
    setLastDataTime(Date.now())
  }

  const handleTestAlert = (type) => {
    // A real crash alert only ever happens while connected — simulate that
    // too, so the crash popup appears over the actual production dashboard
    // (location/sensor cards) instead of the disconnected placeholder screen.
    handleTestConnect()
    handleBLEData({
      type,
      magnitude: type === 'MAJOR' ? '38.45' : '22.10',
      gps: 'phone',
    })
  }

  // ── Contact CRUD ───────────────────────────────────────────────────────────
  const saveContact = (contact) => {
    if (editingContact !== null && editingContact.index !== undefined) {
      setContacts(prev => prev.map((c, i) => i === editingContact.index ? contact : c))
    } else {
      setContacts(prev => [...prev, contact])
    }
    setShowContactForm(false)
    setEditingContact(null)
  }

  const removeContact = (index) => {
    setContacts(prev => prev.filter((_, i) => i !== index))
  }

  // ── Time formatter ─────────────────────────────────────────────────────────
  const timeAgo = (ts) => {
    if (!ts) return ''
    const diff = Math.floor((Date.now() - ts) / 1000)
    if (diff < 5) return 'just now'
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return new Date(ts).toLocaleDateString()
  }

  // ── Signal freshness for sensor health ─────────────────────────────────────
  const [, forceRender] = useState(0)
  useEffect(() => {
    if (!bleConnected) return
    const t = setInterval(() => forceRender(n => n + 1), 5000)
    return () => clearInterval(t)
  }, [bleConnected])

  const sensorFreshness = () => {
    if (!lastDataTime) return { label: 'Waiting for data...', color: palette.warn }
    const age = (Date.now() - lastDataTime) / 1000
    if (age < 10) return { label: `Signal received ${timeAgo(lastDataTime)}`, color: palette.safe }
    if (age < 30) return { label: `Last signal ${timeAgo(lastDataTime)}`, color: palette.warn }
    return { label: `No signal for ${Math.floor(age)}s`, color: palette.danger }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ONBOARDING GATE
  // ═══════════════════════════════════════════════════════════════════════════
  if (!onboarded) return <Onboarding onComplete={completeOnboarding} />

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={S.shell}>
      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <header style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.3rem' }}>🛡️</span>
          <span style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.02em' }}>SafeDrive</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '8px', height: '8px', borderRadius: '50%',
            backgroundColor: bleConnected ? palette.safe : palette.textMuted,
            boxShadow: bleConnected ? `0 0 6px ${palette.safe}` : 'none',
          }}/>
          <span style={{ fontSize: '0.8rem', color: palette.textMuted, fontWeight: 500 }}>
            {bleConnected ? 'Live' : 'Offline'}
          </span>
        </div>
      </header>

      {/* ── MAIN CONTENT ────────────────────────────────────────────────── */}
      <main style={S.main}>

        {/* ═══ HOME TAB ═══════════════════════════════════════════════════ */}
        {activeTab === 'home' && (
          <>
            {/* Connection Screen */}
            {!bleConnected && (
              <div style={{ textAlign: 'center', marginTop: '15vh' }}>
                <div style={{
                  width: '96px', height: '96px', borderRadius: '50%',
                  backgroundColor: palette.primarySoft, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 20px', fontSize: '2.5rem',
                }}>📡</div>
                <h2 style={{ margin: '0 0 8px', fontSize: '1.4rem', fontWeight: 800 }}>Connect Your Sensor</h2>
                <p style={{ color: palette.textMuted, margin: '0 auto 32px', maxWidth: '280px', lineHeight: 1.6 }}>
                  Pair with your vehicle's crash sensor to start safety monitoring.
                </p>
                <button style={S.btnPrimary} onClick={handleBLEConnect}>
                  {bleStatus || 'Scan & Connect'}
                </button>
                {!isBLESupported() && (
                  <p style={{ marginTop: '16px', fontSize: '0.85rem', color: palette.danger }}>
                    Bluetooth is not supported on this browser. Try Chrome on Android.
                  </p>
                )}

                {import.meta.env.VITE_ENABLE_SANDBOX === 'true' && (
                  <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: `1px dashed ${palette.border}` }}>
                    <div style={{ ...S.label, marginBottom: '10px' }}>Test without hardware</div>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                      <button
                        style={{ ...S.btnOutline, width: 'auto', padding: '10px 18px' }}
                        onClick={handleTestConnect}
                      >
                        📡 Simulate Connect
                      </button>
                      <button
                        style={{ ...S.btnOutline, width: 'auto', padding: '10px 18px', borderColor: palette.warn, color: palette.warn }}
                        onClick={() => handleTestAlert('MINOR')}
                      >
                        ⏳ Simulate Minor
                      </button>
                      <button
                        style={{ ...S.btnOutline, width: 'auto', padding: '10px 18px', borderColor: palette.danger, color: palette.danger }}
                        onClick={() => handleTestAlert('MAJOR')}
                      >
                        🚨 Simulate Major
                      </button>
                    </div>
                    <p style={{ margin: '10px 0 0', fontSize: '0.78rem', color: palette.textMuted }}>
                      "Simulate Connect" shows the real connected dashboard UI (location, sensor status, SOS button) exactly as it appears in production — no hardware needed.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Live Dashboard */}
            {bleConnected && (
              <>
                {/* Status Hero */}
                <div style={{
                  ...S.card, border: 'none', textAlign: 'center', padding: '28px 20px',
                  background: (systemStatus === 'idle' || systemStatus === 'cancelled')
                    ? `linear-gradient(135deg, ${palette.safe} 0%, #0a7065 100%)`
                    : `linear-gradient(135deg, ${palette.danger} 0%, #8b1a1a 100%)`,
                  color: '#fff',
                }}>
                  <div style={{ fontSize: '2.8rem', marginBottom: '8px' }}>
                    {(systemStatus === 'idle' || systemStatus === 'cancelled') ? '✓' : '⚠'}
                  </div>
                  <h2 style={{ margin: '0 0 4px', fontSize: '1.3rem', fontWeight: 800 }}>
                    {systemStatus === 'idle' && 'Monitoring Active'}
                    {systemStatus === 'cancelled' && 'You\'re Safe'}
                    {(systemStatus === 'alerting' || systemStatus === 'major') && 'Emergency Sent'}
                  </h2>
                  <p style={{ margin: 0, opacity: 0.85, fontSize: '0.9rem' }}>
                    {systemStatus === 'idle' && 'Watching for impacts in real time'}
                    {systemStatus === 'cancelled' && 'Alert dismissed — drive safe!'}
                    {(systemStatus === 'alerting' || systemStatus === 'major') && `${contacts.length} contact${contacts.length !== 1 ? 's' : ''} notified`}
                  </p>
                </div>

                {/* No contacts warning */}
                {contacts.length === 0 && (
                  <div style={{ ...S.card, backgroundColor: palette.warnSoft, borderColor: '#fbbf24' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>⚠️</span>
                      <div>
                        <p style={{ margin: '0 0 6px', fontWeight: 600, fontSize: '0.9rem', color: '#92400e' }}>
                          No emergency contacts added
                        </p>
                        <p style={{ margin: '0 0 8px', fontSize: '0.85rem', color: '#a16207', lineHeight: 1.5 }}>
                          Add at least one trusted person who'll be notified during an emergency.
                        </p>
                        <button
                          style={{ ...S.btnGhost, color: '#92400e', backgroundColor: '#fef3c7', fontSize: '0.8rem' }}
                          onClick={() => { setActiveTab('contacts'); setShowContactForm(true) }}
                        >
                          Add Contact
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Location Card */}
                <div style={S.card}>
                  <div style={S.label}>Current Location</div>
                  <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.5 }}>{currentAddress}</p>
                </div>

                {/* Sensor Health Card */}
                <div style={S.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={S.label}>Sensor Status</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{
                          width: '7px', height: '7px', borderRadius: '50%',
                          backgroundColor: sensorFreshness().color,
                        }}/>
                        <span style={{ fontSize: '0.9rem', color: sensorFreshness().color, fontWeight: 500 }}>
                          {sensorFreshness().label}
                        </span>
                      </div>
                    </div>
                    <button onClick={handleBLEDisconnect} style={S.btnGhost}>
                      Disconnect
                    </button>
                  </div>
                </div>

                {/* SOS Button */}
                {(systemStatus === 'idle' || systemStatus === 'cancelled') && (
                  <button onClick={handleManualSOS} style={{ ...S.btnDanger, marginTop: '8px' }}>
                    Manual Emergency SOS
                  </button>
                )}

                {/* Test controls — stay reachable after simulating a connection, gated
                    the same way as the disconnected screen's sandbox panel. */}
                {import.meta.env.VITE_ENABLE_SANDBOX === 'true' && (systemStatus === 'idle' || systemStatus === 'cancelled') && (
                  <div style={{ ...S.card, marginTop: '8px', borderStyle: 'dashed' }}>
                    <div style={{ ...S.label, marginBottom: '10px' }}>Test without hardware</div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        style={{ ...S.btnOutline, borderColor: palette.warn, color: palette.warn }}
                        onClick={() => handleTestAlert('MINOR')}
                      >
                        ⏳ Simulate Minor
                      </button>
                      <button
                        style={{ ...S.btnOutline, borderColor: palette.danger, color: palette.danger }}
                        onClick={() => handleTestAlert('MAJOR')}
                      >
                        🚨 Simulate Major
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ═══ CONTACTS TAB ═══════════════════════════════════════════════ */}
        {activeTab === 'contacts' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Emergency Contacts</h2>
              {contacts.length < 5 && (
                <button
                  style={{ ...S.btnGhost, color: palette.primary, backgroundColor: palette.primarySoft }}
                  onClick={() => { setEditingContact(null); setShowContactForm(true) }}
                >
                  + Add
                </button>
              )}
            </div>

            {contacts.length === 0 && !showContactForm && (
              <div style={{ textAlign: 'center', marginTop: '10vh' }}>
                <div style={{
                  width: '80px', height: '80px', borderRadius: '50%',
                  backgroundColor: palette.primarySoft, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px', fontSize: '2rem',
                }}>👥</div>
                <h3 style={{ margin: '0 0 8px', fontWeight: 700 }}>No contacts yet</h3>
                <p style={{ color: palette.textMuted, margin: '0 auto 24px', maxWidth: '260px', lineHeight: 1.5 }}>
                  Add trusted people who should be alerted during an emergency.
                </p>
                <button
                  style={{ ...S.btnPrimary, width: 'auto', padding: '12px 28px', display: 'inline-block' }}
                  onClick={() => { setEditingContact(null); setShowContactForm(true) }}
                >
                  Add First Contact
                </button>
              </div>
            )}

            {contacts.map((c, i) => (
              <div key={i} style={{ ...S.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '44px', height: '44px', borderRadius: '50%',
                    backgroundColor: palette.primarySoft, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.1rem', fontWeight: 700, color: palette.primary,
                  }}>
                    {c.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{c.name}</div>
                    <div style={{ fontSize: '0.82rem', color: palette.textMuted }}>{c.phone} · {c.relation}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    style={{ ...S.btnGhost, color: palette.primary, backgroundColor: palette.primarySoft }}
                    onClick={() => { setEditingContact({ ...c, index: i }); setShowContactForm(true) }}
                  >
                    Edit
                  </button>
                  <button style={S.btnGhost} onClick={() => removeContact(i)}>
                    ✕
                  </button>
                </div>
              </div>
            ))}

            {/* Contact Form Sheet */}
            {showContactForm && (
              <div style={S.overlay} onClick={() => setShowContactForm(false)}>
                <div style={S.sheet} onClick={e => e.stopPropagation()}>
                  <h3 style={{ margin: '0 0 20px', fontSize: '1.1rem', fontWeight: 700 }}>
                    {editingContact?.index !== undefined ? 'Edit Contact' : 'Add Emergency Contact'}
                  </h3>
                  <ContactForm
                    initial={editingContact}
                    onSave={saveContact}
                    onCancel={() => { setShowContactForm(false); setEditingContact(null) }}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* ═══ HISTORY TAB ════════════════════════════════════════════════ */}
        {activeTab === 'history' && (
          <>
            <h2 style={{ margin: '0 0 16px', fontSize: '1.2rem', fontWeight: 800 }}>Alert History</h2>

            {alertHistory.length === 0 && (
              <div style={{ textAlign: 'center', marginTop: '10vh' }}>
                <div style={{
                  width: '80px', height: '80px', borderRadius: '50%',
                  backgroundColor: palette.safeSoft, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px', fontSize: '2rem',
                }}>🎉</div>
                <h3 style={{ margin: '0 0 8px', fontWeight: 700 }}>No incidents recorded</h3>
                <p style={{ color: palette.textMuted, margin: 0, lineHeight: 1.5 }}>That's a great sign — drive safe!</p>
              </div>
            )}

            {alertHistory.map((item) => {
              const isCritical = item.severity === 'critical'
              const wasCancelled = item.outcome === 'cancelled'
              return (
                <div key={item.id} style={S.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: '6px',
                        fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
                        backgroundColor: wasCancelled ? palette.bg : (isCritical ? palette.dangerSoft : palette.warnSoft),
                        color: wasCancelled ? palette.textMuted : (isCritical ? palette.danger : palette.warn),
                      }}>
                        {wasCancelled ? 'Cancelled' : (isCritical ? 'Critical' : 'Minor')}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.78rem', color: palette.textMuted }}>
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 600, marginBottom: '4px' }}>{item.accidentType}</div>
                  <div style={{ fontSize: '0.82rem', color: palette.textMuted, lineHeight: 1.5 }}>
                    {item.address} · {item.impactForce}G force
                    {item.contactsNotified > 0 && !wasCancelled && ` · ${item.contactsNotified} notified`}
                  </div>
                </div>
              )
            })}

            {alertHistory.length > 0 && (
              <button
                style={{ ...S.btnOutline, marginTop: '8px', color: palette.danger, borderColor: palette.danger }}
                onClick={() => {
                  if (window.confirm('Clear all alert history?')) setAlertHistory([])
                }}
              >
                Clear History
              </button>
            )}
          </>
        )}

        {/* ═══ PROFILE TAB ════════════════════════════════════════════════ */}
        {activeTab === 'profile' && (
          <>
            <h2 style={{ margin: '0 0 16px', fontSize: '1.2rem', fontWeight: 800 }}>Your Profile</h2>

            {/* Personal Info */}
            <div style={S.card}>
              <div style={{ ...S.label, marginBottom: '12px' }}>Personal Information</div>
              <ProfileField label="Display Name" value={profile.displayName} placeholder="Your name"
                onChange={v => setProfile(p => ({ ...p, displayName: v }))} />
              <ProfileField label="Email" value={user?.email || ''} disabled />
            </div>

            {/* Medical Info */}
            <div style={S.card}>
              <div style={{ ...S.label, marginBottom: '4px' }}>Medical Information</div>
              <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: palette.textMuted, lineHeight: 1.4 }}>
                Shared with first responders during an emergency.
              </p>
              <ProfileField label="Blood Type" value={profile.bloodType} placeholder="e.g. O+"
                onChange={v => setProfile(p => ({ ...p, bloodType: v }))} />
              <ProfileField label="Allergies" value={profile.allergies} placeholder="e.g. Penicillin, peanuts"
                onChange={v => setProfile(p => ({ ...p, allergies: v }))} />
              <ProfileField label="Medical Conditions" value={profile.conditions} placeholder="e.g. Diabetes, asthma"
                onChange={v => setProfile(p => ({ ...p, conditions: v }))} />
            </div>

            {/* Vehicle Info */}
            <div style={S.card}>
              <div style={{ ...S.label, marginBottom: '12px' }}>Vehicle Details</div>
              <ProfileField label="Make" value={profile.vehicleMake} placeholder="e.g. Toyota"
                onChange={v => setProfile(p => ({ ...p, vehicleMake: v }))} />
              <ProfileField label="Model" value={profile.vehicleModel} placeholder="e.g. Corolla"
                onChange={v => setProfile(p => ({ ...p, vehicleModel: v }))} />
              <ProfileField label="Plate Number" value={profile.vehiclePlate} placeholder="e.g. ABC-1234"
                onChange={v => setProfile(p => ({ ...p, vehiclePlate: v }))} />
            </div>

            {/* Account Actions */}
            <div style={S.card}>
              <div style={{ ...S.label, marginBottom: '12px' }}>Account</div>
              <button onClick={onLogout} style={{ ...S.btnOutline, color: palette.danger, borderColor: palette.danger }}>
                Sign Out
              </button>
            </div>
          </>
        )}
      </main>

      {/* ── BOTTOM TAB BAR ──────────────────────────────────────────────── */}
      <nav style={S.tabBar}>
        {TABS.map(tab => {
          const active = activeTab === tab
          return (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: '3px', padding: '6px 0', background: 'none', border: 'none', cursor: 'pointer',
            }}>
              <TabIcon tab={tab} active={active} />
              <span style={{
                fontSize: '0.68rem', fontWeight: active ? 700 : 500,
                color: active ? palette.primary : palette.textMuted,
                textTransform: 'capitalize',
              }}>
                {tab}
              </span>
              {tab === 'contacts' && contacts.length === 0 && (
                <div style={{
                  position: 'absolute', top: '4px', marginLeft: '16px',
                  width: '6px', height: '6px', borderRadius: '50%', backgroundColor: palette.warn,
                }}/>
              )}
            </button>
          )
        })}
      </nav>

      {/* ══ MINOR ALERT BOTTOM SHEET ══════════════════════════════════════ */}
      {pendingAlert && (
        <div style={S.overlay}>
          <div style={S.sheet}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '50%',
                backgroundColor: palette.warnSoft, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 12px', fontSize: '1.8rem',
              }}>⚠️</div>
              <h2 style={{ margin: '0 0 6px', fontSize: '1.3rem', fontWeight: 800, color: '#92400e' }}>Impact Detected</h2>
              <p style={{ margin: 0, color: palette.textMuted, fontSize: '0.9rem' }}>
                {pendingAlert.impactForce}G at {pendingAlert.address?.split(',')[0] || 'your location'}
              </p>
            </div>

            {/* Countdown Bar */}
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

            <button onClick={handleUserNo} style={{
              ...S.btnPrimary, backgroundColor: palette.bg, color: palette.text, marginBottom: '10px',
            }}>
              I'm fine — cancel
            </button>
            <button onClick={handleUserYes} style={S.btnDanger}>
              Send alert now
            </button>
          </div>
        </div>
      )}

      {/* ══ MAJOR / EMERGENCY FULL-SCREEN ═════════════════════════════════ */}
      {(systemStatus === 'major' || systemStatus === 'alerting') && !pendingAlert && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: `linear-gradient(170deg, ${palette.danger} 0%, #7f1d1d 100%)`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          color: '#fff', textAlign: 'center', padding: '32px 24px',
        }}>
          <div style={{ fontSize: '4rem', marginBottom: '16px', animation: 'pulse 1.2s ease-in-out infinite' }}>🚨</div>
          <h1 style={{ margin: '0 0 8px', fontSize: '1.8rem', fontWeight: 900, letterSpacing: '0.02em' }}>
            {systemStatus === 'major' ? 'CRASH DETECTED' : 'ALERT SENT'}
          </h1>
          <p style={{ margin: '0 0 12px', fontSize: '1.05rem', opacity: 0.9, maxWidth: '300px', lineHeight: 1.5 }}>
            {contacts.length > 0
              ? `${contacts.length} emergency contact${contacts.length !== 1 ? 's' : ''} have been notified.`
              : 'Alert recorded. Add emergency contacts to auto-notify them.'}
          </p>

          {alertSentInfo && (
            <div style={{
              backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: '12px',
              padding: '16px 20px', marginBottom: '28px', width: '100%', maxWidth: '300px',
              fontSize: '0.85rem', lineHeight: 1.6, textAlign: 'left',
            }}>
              <div style={{ marginBottom: '4px' }}>
                <strong>What to do:</strong>
              </div>
              <div>• Stay in your vehicle if safe</div>
              <div>• Turn on hazard lights</div>
              <div>• Call 119 (Police) or 1990 (Ambulance) if needed</div>
            </div>
          )}

          <button onClick={dismissEmergency} style={{
            padding: '14px 32px', fontSize: '1rem', fontWeight: 700,
            color: palette.danger, backgroundColor: '#fff', border: 'none',
            borderRadius: '12px', cursor: 'pointer',
          }}>
            False alarm — I'm safe
          </button>
        </div>
      )}

      {/* ── CSS Keyframes ───────────────────────────────────────────────── */}
      <style>{`
        @keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
        * { -webkit-tap-highlight-color: transparent; }
        input:focus { border-color: ${palette.primary} !important; }
      `}</style>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function ProfileField({ label, value, placeholder, disabled, onChange }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#4a5568', marginBottom: '5px' }}>
        {label}
      </label>
      <input
        type="text" value={value || ''} placeholder={placeholder}
        disabled={disabled}
        onChange={e => onChange?.(e.target.value)}
        style={{
          ...S.input,
          backgroundColor: disabled ? '#edf2f7' : S.input.backgroundColor,
          cursor: disabled ? 'not-allowed' : 'text',
        }}
      />
    </div>
  )
}

function ContactForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '')
  const [phone, setPhone] = useState(initial?.phone || '')
  const [relation, setRelation] = useState(initial?.relation || '')

  const isValid = name.trim() && phone.trim() && relation.trim()

  return (
    <div>
      <div style={{ marginBottom: '14px' }}>
        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#4a5568', marginBottom: '5px' }}>Name</label>
        <input style={S.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Mom" />
      </div>
      <div style={{ marginBottom: '14px' }}>
        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#4a5568', marginBottom: '5px' }}>Phone Number</label>
        <input style={S.input} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+94 77 123 4567" />
      </div>
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#4a5568', marginBottom: '5px' }}>Relationship</label>
        <input style={S.input} value={relation} onChange={e => setRelation(e.target.value)} placeholder="e.g. Parent, Spouse, Friend" />
      </div>
      <button
        style={{ ...S.btnPrimary, opacity: isValid ? 1 : 0.5, pointerEvents: isValid ? 'auto' : 'none' }}
        onClick={() => isValid && onSave({ name: name.trim(), phone: phone.trim(), relation: relation.trim() })}
      >
        {initial?.index !== undefined ? 'Update Contact' : 'Save Contact'}
      </button>
      <button style={{ ...S.btnOutline, marginTop: '10px', border: 'none', color: palette.textMuted }} onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}