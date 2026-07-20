import { createContext, useContext, useState, useEffect } from 'react'
import { subscribeAuth, getUserRole, getStoredRole, setStoredRole } from '../lib/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = subscribeAuth(async (firebaseUser) => {
      setLoading(true)
      setUser(firebaseUser || null)
      if (firebaseUser) {
        try {
          const r = await getUserRole(firebaseUser.uid)
          const resolved = r || getStoredRole(firebaseUser.uid) || null
          setRole(resolved)
          if (r) setStoredRole(firebaseUser.uid, r)
        } catch (err) {
          console.error('Failed to load user role:', err)
          const stored = getStoredRole(firebaseUser.uid)
          setRole(stored || null)
        }
      } else {
        setRole(null)
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
    <AuthContext.Provider value={{ user, role, loading, setRoleFromProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
