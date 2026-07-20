import styles from './Footer.module.css'

export default function Footer({ minimal }) {
  const year = new Date().getFullYear()
  
  if (minimal) {
    return (
      <footer className={styles.minimalFooter}>
        <div className={styles.minimalContent}>
          <span>© {year} IoT Research Project. All rights reserved.</span>
          <span className={styles.minimalSep}>·</span>
          <span>Status: <span className={styles.online}>Operational (Active)</span></span>
          <span className={styles.minimalSep}>·</span>
          <span>ESP32 Hardware Linked</span>
        </div>
      </footer>
    )
  }
  
  return (
    <footer className={styles.footer}>
      <div className={styles.content}>
        <div className={styles.left}>
          <span className={styles.brand}>🛡️ Smart Vehicle Alert System</span>
          <p className={styles.copy}>
            IoT &amp; Embedded System Technologies for Emergency Response Coordination.
          </p>
        </div>
        
        <div className={styles.middle}>
          <span className={styles.hardwareTitle}>⚡ Embedded Hardware Stack</span>
          <span className={styles.hardwareItem}>ESP32 Controller · BLE Broadcast · Vibration Sensor</span>
        </div>
        
        <div className={styles.right}>
          <div className={styles.tagline}>
            <span className={styles.dot}>●</span> System Status: <span className={styles.online}>Operational (Active)</span>
          </div>
          <p className={styles.copyRight}>© {year} IoT Research Project. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
