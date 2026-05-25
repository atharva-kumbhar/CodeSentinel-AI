import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { reviewApi } from '../api/reviewApi'
import { API_BASE_URL } from '../api/config'

const AuthContext = createContext(null)

/**
 * AuthProvider — wraps the entire app and manages GitHub OAuth state.
 *
 * Flow:
 *  1. On mount, calls GET /api/auth/me to check if a session cookie exists.
 *  2. If the URL contains ?auth=success (after OAuth callback), refreshes user
 *     AND sets showRepoModal=true to trigger the repository selection popup.
 *  3. login()  → navigates to /api/auth/github/login  (full page redirect to GitHub)
 *  4. logout() → POST /api/auth/logout, clears local state
 *
 * The raw GitHub token is NEVER visible here — only user profile info.
 */
export function AuthProvider({ children }) {
  const [user,          setUser]          = useState(null)   // { login, name, avatar_url, email } | null
  const [loading,       setLoading]       = useState(true)   // true while checking session
  const [authError,     setAuthError]     = useState(null)
  const [showRepoModal, setShowRepoModal] = useState(false)  // true right after fresh OAuth login

  const fetchCurrentUser = useCallback(async () => {
    try {
      const data = await reviewApi.getAuthMe()
      setUser(data.authenticated ? data.user : null)
      setAuthError(null)
      return data
    } catch (err) {
      setUser(null)
      return { authenticated: false }
    }
  }, [])

  // Check session on mount and handle OAuth redirect params
  useEffect(() => {
    const run = async () => {
      setLoading(true)
      const params = new URLSearchParams(window.location.search)
      const authResult = params.get('auth')

      if (authResult) {
        // Clean the URL so it doesn't persist on refresh
        window.history.replaceState({}, '', window.location.pathname)
      }

      if (authResult === 'denied') {
        setAuthError('GitHub authorization was denied.')
      } else if (authResult === 'error') {
        const msg = params.get('msg') || 'OAuth error occurred.'
        setAuthError(decodeURIComponent(msg))
      }

      const data = await fetchCurrentUser()
      setLoading(false)

      // Show the repo selection modal only on FRESH login (not on page refresh)
      if (authResult === 'success' && data?.authenticated) {
        setShowRepoModal(true)
      }
    }
    run()
  }, [fetchCurrentUser])

  const login = useCallback(() => {
    // Full-page redirect to backend → GitHub OAuth
    const loginUrl = `${API_BASE_URL}/api/auth/github/login`
    if (window.top && window.top !== window.self) {
      window.top.location.href = loginUrl
      return
    }
    window.location.href = loginUrl
  }, [])

  const logout = useCallback(async () => {
    try {
      await reviewApi.logout()
    } catch (_) {/* ignore */}
    setUser(null)
    setAuthError(null)
    setShowRepoModal(false)
  }, [])

  return (
    <AuthContext.Provider value={{
      user, loading, authError,
      showRepoModal, setShowRepoModal,
      login, logout, fetchCurrentUser,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
