/**
 * Firestore Client Helpers
 * ─────────────────────────
 * All Firestore operations from the frontend.
 * Read-only paths only — write operations go through backend API
 * (which validates auth and enforces business logic).
 *
 * Real-time subscriptions use onSnapshot for live updates.
 */
import {
  collection, doc, onSnapshot, query,
  orderBy, limit, where, getDocs, getDoc,
} from 'firebase/firestore'
import { db } from './config'

// ─── Real-time Subscriptions ─────────────────────────────────────────────────

/**
 * Subscribe to a user's recent reviews (real-time feed).
 * Returns an unsubscribe function — call it on component unmount.
 */
export function subscribeToReviews(uid, callback, maxItems = 20) {
  if (!uid) return () => {}
  const q = query(
    collection(db, 'users', uid, 'reviews'),
    orderBy('created_at', 'desc'),
    limit(maxItems),
  )
  return onSnapshot(q, (snapshot) => {
    const reviews = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      // Convert Firestore timestamps to ISO strings for React rendering
      created_at: d.data().created_at?.toDate?.()?.toISOString() || null,
      updated_at: d.data().updated_at?.toDate?.()?.toISOString() || null,
    }))
    callback(reviews)
  }, (err) => {
    console.warn('Review feed subscription error:', err.message)
    callback([])
  })
}

/**
 * Subscribe to monitored repositories for real-time state sync.
 */
export function subscribeToRepos(uid, callback) {
  if (!uid) return () => {}
  const q = query(
    collection(db, 'users', uid, 'repositories'),
    where('enabled', '==', true),
  )
  return onSnapshot(q, (snapshot) => {
    const repos = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
    callback(repos)
  }, (err) => {
    console.warn('Repo subscription error:', err.message)
    callback([])
  })
}

/**
 * Subscribe to a single review document for live status updates
 * (e.g., pending → running → complete).
 */
export function subscribeToReview(uid, reviewId, callback) {
  if (!uid || !reviewId) return () => {}
  const ref = doc(db, 'users', uid, 'reviews', reviewId)
  return onSnapshot(ref, (d) => {
    if (d.exists()) {
      callback({ id: d.id, ...d.data() })
    }
  }, (err) => {
    console.warn('Review doc subscription error:', err.message)
  })
}

/**
 * Subscribe to user settings document.
 */
export function subscribeToSettings(uid, callback) {
  if (!uid) return () => {}
  const ref = doc(db, 'users', uid, 'settings', 'preferences')
  return onSnapshot(ref, (d) => {
    callback(d.exists() ? d.data() : {})
  }, (err) => {
    console.warn('Settings subscription error:', err.message)
    callback({})
  })
}

// ─── One-time Reads ──────────────────────────────────────────────────────────

export async function fetchUser(uid) {
  if (!uid) return null
  const d = await getDoc(doc(db, 'users', uid))
  return d.exists() ? { id: d.id, ...d.data() } : null
}

export async function fetchRepos(uid) {
  if (!uid) return []
  const q = query(collection(db, 'users', uid, 'repositories'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function fetchReviews(uid, maxItems = 20) {
  if (!uid) return []
  const q = query(
    collection(db, 'users', uid, 'reviews'),
    orderBy('created_at', 'desc'),
    limit(maxItems),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    created_at: d.data().created_at?.toDate?.()?.toISOString() || null,
  }))
}
