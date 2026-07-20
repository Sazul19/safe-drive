import { STATUS_LABELS } from '../lib/alerts'
import styles from './StatusBadge.module.css'

export default function StatusBadge({ status, label }) {
  const s = status || 'pending'
  const text = label ?? STATUS_LABELS[s]
  return (
    <span className={`${styles.badge} status-${s}`} title={text}>
      {text}
    </span>
  )
}
