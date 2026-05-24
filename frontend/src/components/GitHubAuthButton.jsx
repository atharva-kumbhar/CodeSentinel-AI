import { useAuth } from '../context/AuthContext'
import { LogIn, LogOut, Lock, Globe, Loader2, AlertCircle } from 'lucide-react'

/** GitHub logo as inline SVG (not available in lucide-react) */
function GitHubMark({ size = 16, className = '' }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="currentColor" className={className}
      aria-hidden="true"
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
    </svg>
  )
}

/**
 * GitHubAuthButton — shows login / logged-in state.
 *
 * When logged in:
 *   - Shows avatar + username
 *   - Private / Public repo badge
 *   - Logout button
 *
 * When not logged in:
 *   - "Login with GitHub" button
 *
 * Compact variant (compact=true) is used in the TopBar.
 * Full variant is used in the Sidebar.
 */
export default function GitHubAuthButton({ compact = false }) {
  const { user, loading, authError, login, logout } = useAuth()

  if (loading) {
    return (
      <div className={`flex items-center gap-2 ${compact ? 'px-3 py-1.5' : 'p-3'}`}>
        <Loader2 size={14} className="animate-spin text-dark-500" />
        {!compact && <span className="text-xs text-dark-500">Checking auth…</span>}
      </div>
    )
  }

  if (user) {
    return (
      <div className={`flex items-center gap-2 ${compact ? '' : 'flex-col'}`}>
        {/* User info row */}
        <div className={`flex items-center gap-2.5 ${compact ? '' : 'w-full px-1'}`}>
          {/* Avatar */}
          <img
            src={user.avatar_url}
            alt={user.login}
            className={`rounded-full border-2 border-low/40 shrink-0 ${compact ? 'w-6 h-6' : 'w-8 h-8'}`}
          />
          {!compact && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-dark-100 truncate">{user.name || user.login}</p>
              <p className="text-[10px] text-dark-500 font-mono truncate">@{user.login}</p>
            </div>
          )}
          {compact && (
            <span className="text-xs font-medium text-dark-300 hidden sm:block">{user.login}</span>
          )}
        </div>

        {/* Private repos badge */}
        {!compact && (
          <div className="
            w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg
            bg-low/10 border border-low/20
          ">
            <Lock size={10} className="text-low shrink-0" />
            <span className="text-[10px] font-semibold text-low">Private repos enabled</span>
          </div>
        )}

        {/* Logout */}
        <button
          id="logout-btn"
          onClick={logout}
          className={`
            flex items-center gap-1.5 text-xs text-dark-500 hover:text-red-400
            transition-colors duration-200
            ${compact ? 'p-1.5 rounded-lg hover:bg-white/[0.05]' : 'w-full px-2.5 py-1.5 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/20'}
          `}
          title="Log out"
        >
          <LogOut size={12} />
          {!compact && <span>Disconnect GitHub</span>}
        </button>
      </div>
    )
  }

  // Not logged in
  return (
    <div className={compact ? '' : 'space-y-2'}>
      {authError && !compact && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-critical/10 border border-critical/20">
          <AlertCircle size={11} className="text-critical mt-0.5 shrink-0" />
          <p className="text-[10px] text-red-300 leading-relaxed">{authError}</p>
        </div>
      )}
      <button
        id="github-login-btn"
        onClick={login}
        className={`
          flex items-center gap-2 font-semibold transition-all duration-200 select-none
          bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] hover:border-white/[0.2]
          text-dark-100 hover:text-white
          ${compact
            ? 'px-3 py-1.5 rounded-lg text-xs'
            : 'w-full px-3 py-2.5 rounded-xl text-sm justify-center'
          }
        `}
      >
        <GitHubMark size={compact ? 13 : 16} />
        {compact ? 'Login' : 'Login with GitHub'}
        {!compact && (
          <span className="ml-auto">
            <Globe size={12} className="text-dark-500" />
          </span>
        )}
      </button>

      {!compact && (
        <p className="text-[10px] text-dark-600 text-center leading-relaxed">
          Connect to review private repositories
        </p>
      )}
    </div>
  )
}
