
export default function ConfirmAlertPopup({ alert, countdown, onYes, onNo }) {
  if (!alert) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', 
      alignItems: 'center', justifyContent: 'center', zIndex: 9999
    }}>
      <div style={{
        background: 'white', padding: '2rem', borderRadius: '16px', 
        width: '90%', maxWidth: '400px', textAlign: 'center', 
        boxShadow: '0 10px 25px rgba(0,0,0,0.2)', border: '2px solid var(--amber)'
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>⚠️</div>
        <h2 style={{ margin: '0 0 1rem', color: '#b45309' }}>Minor Accident Detected</h2>
        
        <div style={{ background: '#f3f4f6', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', textAlign: 'left' }}>
          <p style={{ margin: '0 0 0.5rem', fontWeight: 'bold' }}>💥 Impact: {alert.impactForce} G</p>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#4b5563' }}>📍 {alert.address}</p>
        </div>

        <p style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '1.5rem' }}>
          Do you want to alert Admin & Police?
        </p>

        {/* Countdown Timer */}
        <div style={{
          fontSize: '1.5rem', fontWeight: 'bold', color: countdown <= 10 ? '#dc2626' : '#2563eb',
          marginBottom: '1.5rem'
        }}>
          Auto-alerting in {countdown}s...
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            onClick={onNo}
            style={{
              flex: 1, padding: '0.8rem', fontSize: '1rem', fontWeight: 'bold',
              backgroundColor: '#e5e7eb', color: '#374151', border: 'none', 
              borderRadius: '8px', cursor: 'pointer'
            }}
          >
            No, I'm Fine
          </button>
          <button
            onClick={onYes}
            style={{
              flex: 1, padding: '0.8rem', fontSize: '1rem', fontWeight: 'bold',
              backgroundColor: '#dc2626', color: 'white', border: 'none', 
              borderRadius: '8px', cursor: 'pointer'
            }}
          >
            Yes, Alert Now!
          </button>
        </div>
      </div>
    </div>
  )
}