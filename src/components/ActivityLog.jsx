import { useState, useEffect } from 'react'
import { subscribeAlerts, STATUS_LABELS } from '../lib/alerts'
import styles from './ActivityLog.module.css'

export default function ActivityLog() {
  const [activities, setActivities] = useState([])

  useEffect(() => {
    return subscribeAlerts((list) => {
      // Create a list of "events" from the alerts
      const events = []
      list.forEach(alert => {
        // Report event
        events.push({
          id: `${alert.id}-reported`,
          time: alert.createdAt,
          type: 'report',
          text: `Incident reported: ${alert.vehicleId}`,
          location: alert.address
        })
        
        // Police status change (if not pending) — use the real transition
        // timestamp written by updateAlertStatus(); fall back to createdAt
        // for older records written before that field existed.
        if (alert.policeStatus !== 'pending') {
          events.push({
            id: `${alert.id}-police`,
            time: alert.policeStatusAt || alert.createdAt,
            type: 'police',
            text: `Police: ${STATUS_LABELS[alert.policeStatus]}`,
            vehicle: alert.vehicleId
          })
        }

        // Ambulance status change (if not pending) — same real-timestamp approach
        if (alert.ambulanceStatus !== 'pending') {
          events.push({
            id: `${alert.id}-ambulance`,
            time: alert.ambulanceStatusAt || alert.createdAt,
            type: 'ambulance',
            text: `Suwa Seriya: ${STATUS_LABELS[alert.ambulanceStatus]}`,
            vehicle: alert.vehicleId
          })
        }
      })

      events.sort((a, b) => b.time - a.time)
      setActivities(events.slice(0, 15))
    })
  }, [])

  return (
    <div className={styles.log}>
      <h2 className={styles.title}>Live Situation Feed</h2>
      <div className={styles.feed}>
        {activities.map((act) => (
          <div key={act.id} className={styles.activity}>
            <div className={styles.time}>{new Date(act.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            <div className={styles.dot} data-type={act.type} />
            <div className={styles.content}>
              <div className={styles.text}>{act.text}</div>
              {act.location && <div className={styles.subtext}>{act.location}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
