// Persistent visual indicator shown whenever a dashboard's current alert
// feed contains sandbox/simulated data (any record tagged isTest: true),
// so it's unambiguous — in the UI and in screenshots/demos — which alerts
// are real, even though test alerts live in the same alerts/ collection.
export default function TestModeBanner() {
  return (
    <div style={{
      background: 'repeating-linear-gradient(45deg, #92400e, #92400e 10px, #78350f 10px, #78350f 20px)',
      color: '#fef3c7',
      fontWeight: 700,
      fontSize: '0.8rem',
      textAlign: 'center',
      padding: '6px 12px',
      letterSpacing: '0.02em',
    }}>
      🧪 TEST MODE — showing simulated alerts alongside real ones
    </div>
  )
}
