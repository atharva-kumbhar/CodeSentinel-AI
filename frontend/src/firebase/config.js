/**
 * Firebase Client SDK Configuration
 * ──────────────────────────────────
 * The Firebase web config (apiKey, etc.) is SAFE to expose publicly —
 * it is not a secret. Access control is handled by Firestore Security Rules.
 *
 * NEVER put your Firebase Admin service account key here.
 * The Admin SDK only runs in the backend.
 */
import { initializeApp, getApps } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getAnalytics, isSupported } from 'firebase/analytics'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY             ,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN         ,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID          ,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     ,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID       ,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID    ,
}

// Singleton — avoid re-initializing on hot reload
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]

export const auth = getAuth(app)
export const db   = getFirestore(app)
export const googleProvider = new GoogleAuthProvider()

// Optional: configure Google OAuth scopes
googleProvider.addScope('email')
googleProvider.addScope('profile')

// Analytics — only in browser (not SSR)
export let analytics = null
isSupported().then((yes) => {
  if (yes) analytics = getAnalytics(app)
})

export default app
