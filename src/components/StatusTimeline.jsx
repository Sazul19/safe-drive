import styles from './StatusTimeline.module.css'

const STEPS = [
  { id: 'pending', label: 'Reported', icon: '📡' },
  { id: 'en_route', label: 'Responding', icon: '🚔' },
  { id: 'arrived', label: 'On Scene', icon: '✅' }
]

export default function StatusTimeline({ status }) {
  const currentIndex = STEPS.findIndex(s => s.id === status)
  
  return (
    <div className={styles.timeline}>
      {STEPS.map((step, index) => {
        const isCompleted = index <= currentIndex
        const isActive = index === currentIndex
        
        return (
          <div key={step.id} className={`${styles.step} ${isCompleted ? styles.completed : ''} ${isActive ? styles.active : ''}`}>
            <div className={styles.line} />
            <div className={styles.node}>
              <span className={styles.icon}>{step.icon}</span>
            </div>
            <span className={styles.label}>{step.label}</span>
          </div>
        )
      })}
    </div>
  )
}
