// Shared OSRM route fetching — used by both TrackingMap.jsx (to draw the
// road-shaped route line) and the Police/Ambulance dashboards' movement
// loop (to walk a unit along that same path when GPS-tracking simulation
// is active), so the two stay visually consistent instead of one following
// roads and the other cutting a straight line across the map.
export async function fetchRoute(start, end) {
  const res = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`
  )
  const data = await res.json()
  if (!data.routes || !data.routes[0]) return null
  return data.routes[0].geometry.coordinates.map(c => [c[1], c[0]])
}

// Cumulative distance (in degrees — consistent with the rest of this
// codebase's simple lat/lng-hypot distance math) walked along a polyline —
// steps a position forward by a fixed per-tick distance, following the
// route's actual road geometry instead of a straight line.
export function stepAlongRoute(coords, distanceTraveled) {
  let remaining = distanceTraveled
  for (let i = 0; i < coords.length - 1; i++) {
    const [lat1, lng1] = coords[i]
    const [lat2, lng2] = coords[i + 1]
    const segLen = Math.hypot(lat2 - lat1, lng2 - lng1)
    if (remaining <= segLen) {
      const t = segLen === 0 ? 0 : remaining / segLen
      return {
        lat: lat1 + (lat2 - lat1) * t,
        lng: lng1 + (lng2 - lng1) * t,
        done: false,
      }
    }
    remaining -= segLen
  }
  const last = coords[coords.length - 1]
  return { lat: last[0], lng: last[1], done: true }
}
