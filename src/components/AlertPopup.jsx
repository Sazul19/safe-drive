import { useEffect } from 'react'
import styles from './AlertPopup.module.css'



export default function AlertPopup({ alert, onClose, onView }) {
  useEffect(() => {
    const t = setTimeout(onClose, 12000)
    return () => clearTimeout(t)
  }, [onClose])

  const mapsUrl = `https://www.google.com/maps?q=${alert.lat},${alert.lng}`

  return (
    <div className={styles.overlay} role="dialog" aria-live="assertive">
      <div className={styles.popup}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.pulseIcon}>🚨</span>
            <div>
              <div className={styles.badge}>New Accident Detected</div>
              <div className={styles.badgeSub}>Emergency response required</div>
            </div>
          </div>
          <button className={styles.close} onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Countdown bar */}
        <div className={styles.countdown}>
          <div className={styles.countdownBar} />
        </div>

        {/* Body */}
        <div className={styles.body}>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <div className={styles.infoKey}>Source</div>
              <div className={styles.infoVal}>ESP32 Controller</div>
            </div>

            {alert.accidentType && (
              <div className={`${styles.infoItem} ${styles.infoItemFull}`}>
                <div className={styles.infoKey}>Accident Type</div>
                <div className={styles.infoVal}>{alert.accidentType}</div>
              </div>
            )}
            <div className={`${styles.infoItem} ${styles.infoItemFull}`}>
              <div className={styles.infoKey}>📍 Location</div>
              <div className={styles.infoVal}>{alert.address}</div>
            </div>
            {alert.speed && (
              <div className={styles.infoItem}>
                <div className={styles.infoKey}>Speed at Impact</div>
                <div className={styles.infoVal}>{alert.speed} km/h</div>
              </div>
            )}
            {alert.impactForce && (
              <div className={styles.infoItem}>
                <div className={styles.infoKey}>Impact Force</div>
                <div className={styles.infoVal}>{alert.impactForce} G</div>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.btnMaps}
          >
            📍 Open Maps
          </a>
          <button className={styles.btnView} onClick={onView}>
            ✅ View & Respond
          </button>
        </div>
      </div>
    </div>
  )
}
