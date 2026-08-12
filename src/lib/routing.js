// OSRM route fetching + walking helpers — used by SimulateDropdown to
// animate a unit along a real road route for demo purposes, and by
// TrackingMap.jsx's own independent route-drawing (each fetches its own
// copy; not shared state, just the same public OSRM API).
export async function fetchRoute(start, end) {
  const res = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`
  )
  const data = await res.json()
  if (!data.routes || !data.routes[0]) return null
  return data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]) // [lat, lng]
}

export function routeLength(coords) {
  let total = 0
  for (let i = 0; i < coords.length - 1; i++) {
    total += Math.hypot(coords[i + 1][0] - coords[i][0], coords[i + 1][1] - coords[i][1])
  }
  return total
}

// Cumulative distance (in degrees) walked along a polyline — steps a
// position forward along the route's actual road geometry.
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
