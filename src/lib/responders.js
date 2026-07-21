import { initializeApp, deleteApp } from 'firebase/app'
import { createUserWithEmailAndPassword, signOut, getAuth } from 'firebase/auth'
import { ref, set, get, update, push } from 'firebase/database'
import { auth, db, firebaseConfig } from '../firebase'

// Responder (Police/Ambulance) account provisioning — split out of auth.js
// since this surface grew beyond generic login/signup into full CRUD +
// history. See docs/features/auth-and-account-provisioning.md §4.

const USERS_PATH = 'users'
const AUDIT_PATH = 'auditLog/responderActions'
const PROVISIONABLE_ROLES = ['police', 'ambulance']

function assertProvisionableRole(role) {
  if (!PROVISIONABLE_ROLES.includes(role)) {
    throw new Error(`Only ${PROVISIONABLE_ROLES.join('/')} accounts can be admin-provisioned`)
  }
}

// Writes one entry to the responder-account audit trail. Internal — every
// exported mutation below calls this so there's always a history record.
async function logResponderAction(action, targetUid, targetEmail, details = {}) {
  if (!auth.currentUser) return
  const r = push(ref(db, AUDIT_PATH))
  await set(r, {
    action,
    targetUid,
    targetEmail: targetEmail || '',
    performedBy: auth.currentUser.uid,
    performedByEmail: auth.currentUser.email || '',
    timestamp: Date.now(),
    details,
  })
}

// Creates a Police/Ambulance account without disturbing the calling admin's
// own signed-in session. Firebase's client SDK signs in as whatever account
// createUserWithEmailAndPassword() just created on the auth instance it was
// called against — so we spin up a throwaway secondary Firebase App (same
// config, different name) with its own isolated Auth instance, create the
// account there, then tear the whole thing down. The users/{uid} write still
// goes through the primary `db`/`auth`, i.e. as the admin — which is exactly
// why the admin-role override in database.rules.json's "users" node exists.
export async function createResponderAccount(email, password, displayName, role) {
  assertProvisionableRole(role)
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
      active: true,
      createdAt: Date.now(),
      createdBy: auth.currentUser.uid,
    })
    await logResponderAction('created', cred.user.uid, email, { role, displayName: displayName || '' })
    return cred.user.uid
  } finally {
    // Best-effort cleanup — the secondary app's own session is discarded
    // either way once deleteApp() runs; sign-out first just avoids a
    // dangling authenticated session in the interim.
    await signOut(secondaryAuth).catch(() => {})
    await deleteApp(secondaryApp).catch(() => {})
  }
}

// Admin-only (enforced by database.rules.json) — lists all Police/Ambulance
// accounts for the Manage Responders view.
export async function listResponders() {
  const snap = await get(ref(db, USERS_PATH))
  const data = snap.val()
  if (!data) return []
  return Object.entries(data)
    .map(([uid, v]) => ({ uid, ...v }))
    .filter(u => PROVISIONABLE_ROLES.includes(u.role))
}

// Edits display name and/or role for an existing responder. Deliberately
// cannot change email/password — those belong to Firebase Auth and can't be
// modified for another user from client-side code without a backend.
export async function updateResponderAccount(uid, { displayName, role }) {
  if (role !== undefined) assertProvisionableRole(role)

  const snap = await get(ref(db, `${USERS_PATH}/${uid}`))
  const existing = snap.val()
  if (!existing) throw new Error('Account not found')

  const updates = {}
  if (displayName !== undefined && displayName !== existing.displayName) updates.displayName = displayName
  if (role !== undefined && role !== existing.role) updates.role = role

  if (Object.keys(updates).length === 0) return

  await update(ref(db, `${USERS_PATH}/${uid}`), updates)
  await logResponderAction('updated', uid, existing.email, updates)
}

// Soft-delete: flips `active` to false. This does NOT delete the underlying
// Firebase Auth account (not possible for another user from client-side
// code without a backend/Admin SDK) — it only blocks the app from letting
// that account in, enforced by ProtectedRoute checking `active !== false`.
export async function deactivateResponderAccount(uid) {
  const snap = await get(ref(db, `${USERS_PATH}/${uid}`))
  const existing = snap.val()
  if (!existing) throw new Error('Account not found')

  await update(ref(db, `${USERS_PATH}/${uid}`), { active: false })
  await logResponderAction('deactivated', uid, existing.email)
}

export async function reactivateResponderAccount(uid) {
  const snap = await get(ref(db, `${USERS_PATH}/${uid}`))
  const existing = snap.val()
  if (!existing) throw new Error('Account not found')

  await update(ref(db, `${USERS_PATH}/${uid}`), { active: true })
  await logResponderAction('reactivated', uid, existing.email)
}

// Admin-only — reverse-chronological feed of every create/update/deactivate/
// reactivate action, for the History view.
export async function getResponderHistory() {
  const snap = await get(ref(db, AUDIT_PATH))
  const data = snap.val()
  if (!data) return []
  return Object.entries(data)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
}
