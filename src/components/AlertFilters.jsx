import styles from './AlertFilters.module.css'

const SEVERITY_OPTIONS = [
  { value: '', label: 'All Severities' },
  { value: 'critical', label: '🔴 Critical' },
  { value: 'high',     label: '🟠 High' },
  { value: 'medium',   label: '🟡 Medium' },
  { value: 'low',      label: '🟢 Low' },
]

const SORT_OPTIONS = [
  { value: 'newest', label: '🕒 Newest First' },
  { value: 'oldest', label: '🕒 Oldest First' },
]

/**
 * AlertFilters – reusable filter/sort bar for all dashboards.
 * @param {object} filters        – current filter state
 * @param {function} onFilter     – called with new filter key/value
 * @param {string} role           – 'admin' | 'police' | 'ambulance'
 * @param {number} total          – total alert count (for label)
 * @param {number} shown          – filtered count
 */
export default function AlertFilters({ filters, onFilter, role, total, shown }) {
  const statusKey = role === 'police' ? 'policeStatus' : 'ambulanceStatus'

  const STATUS_OPTIONS = role === 'admin'
    ? []   // Admin doesn't filter by response status (shows both)
    : [
        { value: '', label: 'All Statuses' },
        { value: 'pending',   label: '🔴 Pending' },
        { value: 'en_route',  label: '🟡 En Route' },
        { value: 'arrived',   label: '✅ Arrived' },
      ]

  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        <select
          className={styles.select}
          value={filters.severity || ''}
          onChange={e => onFilter('severity', e.target.value)}
          aria-label="Filter by severity"
        >
          {SEVERITY_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {STATUS_OPTIONS.length > 0 && (
          <select
            className={styles.select}
            value={filters[statusKey] || ''}
            onChange={e => onFilter(statusKey, e.target.value)}
            aria-label="Filter by status"
          >
            {STATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )}

        <select
          className={styles.select}
          value={filters.sort || 'newest'}
          onChange={e => onFilter('sort', e.target.value)}
          aria-label="Sort order"
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {(filters.severity || filters[statusKey]) && (
          <button
            className={styles.clearBtn}
            onClick={() => {
              onFilter('severity', '')
              onFilter(statusKey, '')
              onFilter('sort', 'newest')
            }}
          >
            ✕ Clear
          </button>
        )}
      </div>

      <span className={styles.count}>
        {shown === total ? `${total} alerts` : `${shown} of ${total}`}
      </span>
    </div>
  )
}

/**
 * applyFilters – pure helper to filter + sort an alerts array.
 * Call this in each dashboard.
 */
export function applyFilters(alerts, filters, role) {
  const statusKey = role === 'police' ? 'policeStatus' : 'ambulanceStatus'
  let list = [...alerts]

  if (filters.severity)        list = list.filter(a => a.severity === filters.severity)
  if (filters[statusKey])      list = list.filter(a => a[statusKey] === filters[statusKey])
  if (filters.sort === 'oldest') list.reverse()

  return list
}
