const NOTIFICATION_TAG = 'emergency-alert'
const MUTE_STORAGE_KEY = 'safedrive_alerts_muted'

// ── Mute state — persisted so it survives a page reload ─────────────────────
let _muted = (() => {
  try { return localStorage.getItem(MUTE_STORAGE_KEY) === '1' } catch { return false }
})()

export const setMuted = (val) => {
  _muted = val
  try { localStorage.setItem(MUTE_STORAGE_KEY, val ? '1' : '0') } catch {}
}
export const isMuted = () => _muted

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  const permission = await Notification.requestPermission()
  return permission
}

export function showAlertNotification(alert) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const title = '🚨 New accident alert'
  const body = `${alert.vehicleId} – ${alert.address || 'Check location'}`
  const n = new Notification(title, {
    body,
    tag: NOTIFICATION_TAG,
    requireInteraction: true,
  })
  n.onclick = () => {
    window.focus()
    n.close()
  }
}

let audioCtx = null

export function playAlertSound() {
  if (_muted) return   // ← respect mute toggle
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    }
    
    // Resume context if suspended (common browser policy)
    if (audioCtx.state === 'suspended') {
      audioCtx.resume()
    }

    const playTone = (freq, start, duration) => {
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      
      // 'square' is louder and more attention-grabbing than 'triangle'
      osc.type = 'square'
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      
      osc.frequency.setValueAtTime(freq, start)
      
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.2, start + 0.02) // Slightly lower gain for square wave
      gain.gain.exponentialRampToValueAtTime(0.01, start + duration)
      
      osc.start(start)
      osc.stop(start + duration)
    }

    const now = audioCtx.currentTime
    // Piercing siren pattern
    const tones = [900, 700, 900, 700]
    tones.forEach((freq, i) => {
      playTone(freq, now + i * 0.3, 0.25)
    })

  } catch (e) {
    console.warn('Audio alert failed:', e)
  }
}
