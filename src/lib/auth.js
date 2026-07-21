import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { ref, set, get } from 'firebase/database'
import { auth, db } from '../firebase'

const USERS_PATH = 'users'

// Public self-signup is driver-only. Police/Ambulance (and any future admin)
// accounts are provisioned by an existing admin — see lib/responders.js and
// docs/features/auth-and-account-provisioning.md for the full rationale.
export async function signUp(email, password, displayName) {
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  await set(ref(db, `${USERS_PATH}/${cred.user.uid}`), {
    email,
    displayName: displayName || '',
    role: 'user',
    createdAt: Date.now(),
  })
  return cred.user
}

export async function logIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password)
  return cred.user
}

export function logOut() {
  return signOut(auth)
}

export function subscribeAuth(callback) {
  return onAuthStateChanged(auth, callback)
}

export async function getUserRole(uid) {
  const snap = await get(ref(db, `${USERS_PATH}/${uid}`))
  const data = snap.val()
  return data?.role || null
}

export async function getUserProfile(uid) {
  const snap = await get(ref(db, `${USERS_PATH}/${uid}`))
  return snap.val()
}

const ROLE_STORAGE_KEY = 'alert-role'

export function getStoredRole(uid) {
  try {
    return localStorage.getItem(`${ROLE_STORAGE_KEY}-${uid}`)
  } catch {
    return null
  }
}

export function setStoredRole(uid, role) {
  try {
    if (role) localStorage.setItem(`${ROLE_STORAGE_KEY}-${uid}`, role)
    else localStorage.removeItem(`${ROLE_STORAGE_KEY}-${uid}`)
  } catch {}
}

// Recovery path for a signed-in account that ended up with no role record
// (e.g. the initial signUp() write failed). Deliberately NOT parameterized
// by role — self-service role recovery can only ever land someone as a
// driver ('user'). Admin/Police/Ambulance are never self-assignable; those
// come from createResponderAccount() (admin-provisioned) or the one
// pre-existing admin account. See SetRole.jsx, the only caller.
export async function setUserRole(uid, email) {
  await set(ref(db, `${USERS_PATH}/${uid}`), {
    email: email || '',
    displayName: '',
    role: 'user',
    createdAt: Date.now(),
  })
}
