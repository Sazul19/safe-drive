import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'
import { setMuted, isMuted } from '../lib/notifications'
import { subscribeConnectionState } from '../lib/alerts'
import styles from './DashboardLayout.module.css'
import Footer from './Footer'
import ActivityLog from './ActivityLog'

function LiveClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const dateStr = time.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const timeStr = time.toLocaleTimeString('en-GB')
  return (
    <span className={styles.clock}>
      {dateStr} - {timeStr}
    </span>
  )
}

export default function DashboardLayout({ title, role, user, onLogout, children }) {
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [muted, setMutedState] = useState(() => isMuted())
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [connected, setConnected] = useState(true)
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()

  useEffect(() => subscribeConnectionState(setConnected), [])

  const handleMuteToggle = () => {
    const next = !muted
    setMuted(next)
    setMutedState(next)
  }

  const icon = role === 'admin' ? '🛡️' : role === 'police' ? '🚔' : role === 'ambulance' ? '🚑' : '🚗'
  const roleLabel = role === 'admin' ? 'Super Administrator' : role === 'police' ? 'Police Officer' : role === 'ambulance' ? 'Ambulance Crew' : 'Driver'
  const email = user?.email || ''
  const displayEmail = email.split('@')[0]
  const initials = email ? email.slice(0, 2).toUpperCase() : '??'

  const isActive = (path) => location.pathname === path

  const handleLinkClick = () => {
    setMobileMenuOpen(false)
  }

  const handleNavClick = (e, targetId) => {
    e.preventDefault()
    if (location.pathname === '/history') {
      window.location.href = `/${role}#${targetId}`
    } else {
      const el = document.getElementById(targetId)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' })
      }
    }
    setMobileMenuOpen(false)
  }

  useEffect(() => {
    if (window.location.hash) {
      const targetId = window.location.hash.slice(1)
      const timer = setTimeout(() => {
        const el = document.getElementById(targetId)
        if (el) el.scrollIntoView({ behavior: 'smooth' })
      }, 400)
      return () => clearTimeout(timer)
    }
  }, [location.pathname])

  return (
    <div className={styles.container}>
      <div className="scanline" />
      
      {/* ── MOBILE MENU OVERLAY ── */}
      {mobileMenuOpen && (
        <div className={styles.mobileOverlay} onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* ── LEFT SIDEBAR (Collapsible drawer on mobile) ── */}
      <aside className={`${styles.sidebar} ${mobileMenuOpen ? styles.sidebarOpen : ''}`}>
        {/* Brand */}
        <div className={styles.brand}>
          <div className={styles.brandMark}>
            <span style={{ filter: 'drop-shadow(0 0 8px var(--red))' }}>🚨</span>
          </div>
          <div className={styles.brandText}>
            <span className={styles.brandTitle}>Smart Alert System</span>
            <span className={styles.brandSubtitle}>Accident Detection & Response</span>
          </div>
          <button className={styles.sidebarClose} onClick={() => setMobileMenuOpen(false)}>
            ✕
          </button>
        </div>

        {/* Navigation Sections */}
        <nav className={styles.nav}>
          <div className={styles.navSection}>
            <span className={styles.navSectionTitle}>Main Console</span>
            
            <Link 
              to={`/${role}`} 
              className={`${styles.navLink} ${isActive(`/${role}`) ? styles.navLinkActive : ''}`}
              onClick={handleLinkClick}
            >
              <span className={styles.navIcon}>📊</span>
              <span className={styles.navLabel}>Dashboard</span>
            </Link>

            <a href="#map-section" className={styles.navLink} onClick={(e) => handleNavClick(e, 'map-section')}>
              <span className={styles.navIcon}>🗺️</span>
              <span className={styles.navLabel}>Live Map</span>
            </a>

            <Link 
              to="/history" 
              className={`${styles.navLink} ${isActive('/history') ? styles.navLinkActive : ''}`}
              onClick={handleLinkClick}
            >
              <span className={styles.navIcon}>📋</span>
              <span className={styles.navLabel}>Incidents History</span>
            </Link>

            <Link
              to="/alerts"
              className={`${styles.navLink} ${isActive('/alerts') ? styles.navLinkActive : ''}`}
              onClick={handleLinkClick}
            >
              <span className={styles.navIcon}>🚨</span>
              <span className={styles.navLabel}>Live Alerts</span>
            </Link>
          </div>

          {role === 'admin' && (
            <div className={styles.navSection}>
              <span className={styles.navSectionTitle}>Administration</span>

              <Link
                to="/admin/responders"
                className={`${styles.navLink} ${isActive('/admin/responders') ? styles.navLinkActive : ''}`}
                onClick={handleLinkClick}
              >
                <span className={styles.navIcon}>👮</span>
                <span className={styles.navLabel}>Manage Responders</span>
              </Link>
            </div>
          )}
        </nav>

        {/* Theme and Volume Toggles in Sidebar */}
        <div className={styles.sidebarControls}>
          <button
            className={`${styles.iconBtn} ${muted ? styles.mutedBtn : ''}`}
            onClick={handleMuteToggle}
            title={muted ? 'Unmute alerts' : 'Mute alerts'}
          >
            {muted ? '🔕 Muted' : '🔔 Alerts Sound'}
          </button>

          <button className={styles.iconBtn} onClick={toggleTheme} title="Toggle Theme">
            {theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}
          </button>
        </div>

        {/* User profile bottom widget */}
        <div className={styles.sidebarProfile}>
          <div className={styles.profileInfo}>
            <div className={styles.profileAvatar}>{initials}</div>
            <div className={styles.profileMeta}>
              <span className={styles.profileName} title={email}>{displayEmail}</span>
              <span className={styles.profileRole}>{roleLabel}</span>
            </div>
          </div>
          <button className={styles.profileLogoutBtn} onClick={onLogout} title="Log out">
            🚪
          </button>
        </div>
      </aside>

      {/* ── MAIN WORKSPACE ── */}
      <div className={styles.workspace}>
        {/* Top Header */}
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            {/* Hamburger Trigger */}
            <button 
              className={styles.hamburger} 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle Navigation Menu"
            >
              ☰
            </button>
            <span className={styles.systemLabel}>System Console · {role.toUpperCase()}</span>
          </div>

          <div className={styles.headerRight}>
            <span
              className={`${styles.liveDot} ${connected ? '' : styles.offline}`}
              title={connected ? 'Connected to Firebase' : 'Disconnected — realtime updates paused'}
            >
              {connected ? 'Live Feed' : 'Offline'}
            </span>
            <LiveClock />
            
            <div className={styles.bellWrapper} title="Notifications">
              <span className={styles.bellIcon}>🔔</span>
              <span className={styles.bellBadge} />
            </div>

            <div className={styles.userMenuWrapper}>
              <div 
                className={`${styles.userPill} ${showUserMenu ? styles.active : ''}`}
                onClick={() => setShowUserMenu(!showUserMenu)}
              >
                <div className={styles.userAvatarSm}>{initials}</div>
                <span className={styles.userEmail}>{displayEmail}</span>
                <span className={styles.chevron}>▾</span>
              </div>
              
              {showUserMenu && (
                <div className={styles.dropdown}>
                  <div className={styles.dropdownHeader}>
                    <div className={styles.dropdownInitials}>{initials}</div>
                    <div className={styles.dropdownInfo}>
                      <div className={styles.dropdownEmail} title={email}>{email}</div>
                      <div className={styles.dropdownRole}>{roleLabel}</div>
                    </div>
                  </div>
                  <div className={styles.dropdownDivider} />
                  <Link to="/history" className={styles.dropdownItem} onClick={() => setShowUserMenu(false)}>
                    <span className={styles.itemIcon}>🕒</span>
                    Incident History
                  </Link>
                  <button className={styles.dropdownItem} onClick={onLogout}>
                    <span className={styles.itemIcon}>🚪</span>
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Inner Content Grid */}
        <div className={styles.layout}>
          <main className={styles.main}>
            {children}
            <Footer minimal />
          </main>
          <aside className={styles.asideLog}>
            <div className={styles.logTitleRow}>
              <span className={styles.logTitle}>Live Activity Logs</span>
              <span className={styles.logSub}>Real-time system actions</span>
            </div>
            <ActivityLog />
          </aside>
        </div>
      </div>
    </div>
  )
}
