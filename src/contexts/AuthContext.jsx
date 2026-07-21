import { createContext, useContext, useState, useEffect } from 'react'
import { subscribeAuth, getUserProfile, getStoredRole, setStoredRole } from '../lib/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  // Deactivated Police/Ambulance accounts (see lib/responders.js) have
  // active:false on their users/{uid} record. Missing field = active, for
  // backward compatibility with records written before this existed.
  const [active, setActive] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = subscribeAuth(async (firebaseUser) => {
      setLoading(true)
      setUser(firebaseUser || null)
      if (firebaseUser) {
        try {
          const profile = await getUserProfile(firebaseUser.uid)
          const r = profile?.role || null
          const resolved = r || getStoredRole(firebaseUser.uid) || null
          setRole(resolved)
          setActive(profile?.active !== false)
          if (r) setStoredRole(firebaseUser.uid, r)
        } catch (err) {
          console.error('Failed to load user role:', err)
          const stored = getStoredRole(firebaseUser.uid)
          setRole(stored || null)
          setActive(true)
        }
      } else {
        setRole(null)
        setActive(true)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  function setRoleFromProfile(selectedRole) {
    if (!user) return
    setStoredRole(user.uid, selectedRole)
    setRole(selectedRole)
  }

  return (
    <AuthContext.Provider value={{ user, role, active, loading, setRoleFromProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
