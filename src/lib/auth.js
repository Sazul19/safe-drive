import { initializeApp, deleteApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  getAuth,
} from 'firebase/auth'
import { ref, set, get } from 'firebase/database'
import { auth, db, firebaseConfig } from '../firebase'

const USERS_PATH = 'users'

// Public self-signup is driver-only. Police/Ambulance (and any future admin)
// accounts are provisioned by an existing admin via createResponderAccount()
// below — see docs/features/admin-dashboard.md "Account Provisioning" and
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

const PROVISIONABLE_ROLES = ['police', 'ambulance']

// Creates a Police/Ambulance account without disturbing the calling admin's
// own signed-in session. Firebase's client SDK signs in as whatever account
// createUserWithEmailAndPassword() just created on the auth instance it was
// called against — so we spin up a throwaway secondary Firebase App (same
// config, different name) with its own isolated Auth instance, create the
// account there, then tear the whole thing down. The users/{uid} write still
// goes through the primary `db`/`auth`, i.e. as the admin — which is exactly
// why the admin-role override in database.rules.json's "users" node exists.
export async function createResponderAccount(email, password, displayName, role) {
  if (!PROVISIONABLE_ROLES.includes(role)) {
    throw new Error(`Only ${PROVISIONABLE_ROLES.join('/')} accounts can be admin-provisioned`)
  }
  if (!auth.currentUser) {
    throw new Error('Must be signed in to provision an account')
  }

  const secondaryApp = initializeApp(firebaseConfig, `provision-${Date.now()}`)
  const secondaryAuth = getAuth(secondaryApp)
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password)
    await set(ref(db, `${USERS_PATH}/${cred.user.uid}`), {
      email,
      displayName: displayName || '',
      role,
      createdAt: Date.now(),
      createdBy: auth.currentUser.uid,
    })
    return cred.user.uid
  } finally {
    // Best-effort cleanup — the secondary app's own session is discarded
    // either way once deleteApp() runs; sign-out first just avoids a
    // dangling authenticated session in the interim.
    await signOut(secondaryAuth).catch(() => {})
    await deleteApp(secondaryApp).catch(() => {})
  }
}

// Admin-only (enforced by database.rules.json) — lists all provisioned
// accounts so the admin can see who already has Police/Ambulance access.
export async function listAllUsers() {
  const snap = await get(ref(db, USERS_PATH))
  const data = snap.val()
  if (!data) return []
  return Object.entries(data).map(([uid, v]) => ({ uid, ...v }))
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
