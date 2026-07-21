import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useTheme } from '../contexts/ThemeContext'

const createEmojiIcon = (emoji, color = '#3b82f6', isPulsing = false) => {
  const animation = isPulsing ? 'animation: marker-pulse 2s infinite;' : '';
  return L.divIcon({
    html: `
      <div style="
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        background: ${color}22;
        border: 2px solid ${color};
        border-radius: 50%;
        font-size: 16px;
        box-shadow: 0 0 10px ${color}44;
        ${animation}
      ">
        ${emoji}
      </div>
    `,
    className: 'custom-marker-icon',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  })
}

const icons = {
  police: createEmojiIcon('🚔', '#3b82f6'),
  ambulance: createEmojiIcon('🚑', '#10b981'),
  alert: createEmojiIcon('💥', '#ef4444', true),
}

const DEFAULT_CENTER = [6.9271, 79.8612]
const DEFAULT_ZOOM = 13
const FOCUS_ZOOM = 16

export default function TrackingMap({ alerts = [], units = [], focusedAlertId = null }) {
  const { theme } = useTheme()
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({})
  const routesRef = useRef({})
  const tileLayerRef = useRef(null)
  // Tracks which (alertId:status) route has already been fetched from OSRM
  // per unit, so we don't hit the public routing server on every 3s position
  // tick — only once per en_route/arrived transition.
  const fetchedRouteRef = useRef({})

  useEffect(() => {
    if (!mapContainerRef.current) return

    // Initialize map
    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false
    }).setView(DEFAULT_CENTER, DEFAULT_ZOOM)
    
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Dynamic Tile Layer update on theme changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (tileLayerRef.current) {
      tileLayerRef.current.remove()
    }

    const url = theme === 'light'
      ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'

    const layer = L.tileLayer(url, {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map)

    tileLayerRef.current = layer
  }, [theme])

  // Fly to a single focused accident (see AdminDashboard/PoliceDashboard/
  // AmbulanceDashboard "Focus on Map" — clicking an alert card filters
  // `alerts`/`units` down to just that incident and sets this id so the map
  // also zooms in on it). Clearing focus flies back to the default view.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (focusedAlertId) {
      const target = alerts.find(a => a.id === focusedAlertId)
      if (target) map.flyTo([target.lat, target.lng], FOCUS_ZOOM, { duration: 0.8 })
    } else {
      map.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, { duration: 0.8 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedAlertId])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // helper to fetch route from OSRM
    const updateRoute = async (unitId, start, end, role, status = 'en_route') => {
      try {
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`)
        const data = await res.json()
        if (data.routes && data.routes[0]) {
          const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]])
          
          if (routesRef.current[unitId]) {
            const { glow, main } = routesRef.current[unitId]
            glow.setLatLngs(coords)
            main.setLatLngs(coords)
            if (status === 'arrived') {
              glow.setStyle({ color: '#64748b', weight: 8, opacity: 0.2, dashArray: null })
              main.setStyle({ color: '#64748b', weight: 3, opacity: 0.8, dashArray: null })
            } else {
              const color = role === 'police' ? '#3b82f6' : '#10b981'
              glow.setStyle({ color, weight: 8, opacity: 0.25, dashArray: role === 'police' ? null : '10, 10' })
              main.setStyle({ color, weight: 3, opacity: 0.9, dashArray: role === 'police' ? null : '10, 10' })
            }
          } else {
            const isArrived = status === 'arrived'
            const color = isArrived ? '#64748b' : (role === 'police' ? '#3b82f6' : '#10b981')
            const glow = L.polyline(coords, { 
              color, 
              weight: 8, 
              opacity: isArrived ? 0.2 : 0.25,
              dashArray: isArrived ? null : (role === 'police' ? null : '10, 10')
            }).addTo(map)
            const main = L.polyline(coords, { 
              color, 
              weight: 3, 
              opacity: isArrived ? 0.8 : 0.9,
              dashArray: isArrived ? null : (role === 'police' ? null : '10, 10')
            }).addTo(map)
            routesRef.current[unitId] = { glow, main }
          }
        }
      } catch (e) {
        console.error('Routing error:', e)
      }
    }

    const currentMarkerIds = new Set([
      ...alerts.map(a => `alert-${a.id}`),
      ...units.map(u => `unit-${u.uid}`)
    ])

    // Clear removed markers and routes
    Object.keys(markersRef.current).forEach(id => {
      if (!currentMarkerIds.has(id)) {
        markersRef.current[id].remove()
        delete markersRef.current[id]
      }
    })
    
    const currentUnitIds = new Set(units.filter(u => u.alertId).map(u => u.uid))
    Object.keys(routesRef.current).forEach(uid => {
      if (!currentUnitIds.has(uid)) {
        const route = routesRef.current[uid]
        if (route.glow) route.glow.remove()
        if (route.main) route.main.remove()
        delete routesRef.current[uid]
        delete fetchedRouteRef.current[uid]
      }
    })

    // Update/Add Alerts
    alerts.forEach(a => {
      const id = `alert-${a.id}`
      const popupContent = `
        <div style="font-family: var(--font); color: var(--text-primary); min-width: 200px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; gap: 8px;">
            <span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);">
              🚨 Incident Alert
            </span>
            <span style="
              font-size: 0.62rem;
              font-weight: 800;
              text-transform: uppercase;
              padding: 1.5px 5px;
              border-radius: 4px;
              background: ${a.severity === 'critical' ? 'var(--red-bg)' : 'var(--amber-bg)'};
              color: ${a.severity === 'critical' ? 'var(--red)' : 'var(--amber)'};
              border: 1px solid ${a.severity === 'critical' ? 'var(--red-border)' : 'var(--amber-border)'};
            ">
              ${a.severity || 'high'}
            </span>
          </div>
          <div style="font-weight: 700; font-size: 0.88rem; margin-bottom: 4px; color: var(--text-primary);">${a.accidentType || 'Accident Detected'}</div>
          <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 6px; line-height: 1.3;">📍 ${a.address}</div>
          <div style="display: flex; gap: 6px; font-size: 0.7rem; font-weight: 600;">
            ${a.impactForce ? `<span style="background: var(--inner-glow); border: 1px solid var(--border); padding: 2.5px 6px; border-radius: 4px; color: var(--text-secondary);">💥 ${a.impactForce} G</span>` : ''}
            ${a.speed ? `<span style="background: var(--inner-glow); border: 1px solid var(--border); padding: 2.5px 6px; border-radius: 4px; color: var(--text-secondary);">⚡ ${a.speed} km/h</span>` : ''}
          </div>
        </div>
      `;

      if (markersRef.current[id]) {
        markersRef.current[id].setLatLng([a.lat, a.lng])
        markersRef.current[id].setPopupContent(popupContent)
      } else {
        const marker = L.marker([a.lat, a.lng], { icon: icons.alert })
          .addTo(map)
          .bindPopup(popupContent)
        markersRef.current[id] = marker
      }
    })

    // Update/Add Units & Routes
    units.forEach(u => {
      const id = `unit-${u.uid}`
      const targetAlert = u.alertId ? alerts.find(a => a.id === u.alertId) : null
      const status = targetAlert ? (u.role === 'police' ? targetAlert.policeStatus : targetAlert.ambulanceStatus) : 'available'
      
      const statusText = status === 'en_route' 
        ? 'Responding (En Route)' 
        : (status === 'arrived' ? 'On Scene (Arrived)' : 'Available')

      const popupContent = `
        <div style="font-family: var(--font); color: var(--text-primary); min-width: 180px;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
            <span style="font-size: 1rem;">${u.role === 'police' ? '🚔' : '🚑'}</span>
            <span style="font-weight: 800; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; color: ${u.role === 'police' ? 'var(--blue)' : 'var(--green)'};">
              ${u.role.toUpperCase()} UNIT
            </span>
          </div>
          <div style="font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 4px;">
            Status: <span style="font-weight: 700; color: var(--text-primary);">${statusText}</span>
          </div>
          ${u.speed ? `<div style="font-size: 0.72rem; color: var(--text-muted);">Current Speed: <strong style="color: var(--text-primary);">${u.speed} km/h</strong></div>` : ''}
        </div>
      `;

      if (markersRef.current[id]) {
        markersRef.current[id].setLatLng([u.lat, u.lng])
        markersRef.current[id].setPopupContent(popupContent)
      } else {
        const marker = L.marker([u.lat, u.lng], { 
          icon: u.role === 'police' ? icons.police : icons.ambulance 
        })
          .addTo(map)
          .bindPopup(popupContent)
        markersRef.current[id] = marker
      }

      // Routing logic — fetch from OSRM only once per (alertId, status)
      // transition per unit, not on every 3s position tick, since the public
      // demo routing server is rate-limited and the planned path doesn't
      // change as the unit moves along it.
      if (u.alertId && targetAlert) {
        const routeKey = `${u.alertId}:${status}`
        if (fetchedRouteRef.current[u.uid] !== routeKey) {
          fetchedRouteRef.current[u.uid] = routeKey
          if (status === 'en_route') {
            const sLat = u.startLat !== undefined && u.startLat !== null ? u.startLat : u.lat
            const sLng = u.startLng !== undefined && u.startLng !== null ? u.startLng : u.lng
            updateRoute(u.uid, [sLat, sLng], [targetAlert.lat, targetAlert.lng], u.role, 'en_route')
          } else if (status === 'arrived') {
            const sLat = u.startLat !== undefined && u.startLat !== null ? u.startLat : (u.lat - 0.005)
            const sLng = u.startLng !== undefined && u.startLng !== null ? u.startLng : (u.lng - 0.005)
            updateRoute(u.uid, [sLat, sLng], [targetAlert.lat, targetAlert.lng], u.role, 'arrived')
          }
        }
      } else {
        delete fetchedRouteRef.current[u.uid]
      }
    })
  }, [alerts, units])

  return (
    <div 
      ref={mapContainerRef} 
      id="map-section"
      style={{ 
        height: '450px', 
        width: '100%', 
        borderRadius: '1rem', 
        overflow: 'hidden', 
        border: '1px solid var(--border)', 
        marginBottom: '2rem',
        background: 'var(--bg-2)'
      }} 
    />
  )
}
