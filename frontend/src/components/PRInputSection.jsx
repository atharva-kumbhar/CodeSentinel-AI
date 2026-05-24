import { useState, useRef } from 'react'
import {
  GitPullRequest, Search, ArrowRight, X, Sparkles,
  ExternalLink, AlertCircle, KeyRound, Eye, EyeOff,
  ChevronDown, ChevronUp, Info, ShieldOff, Lock, CheckCircle2, MessageSquarePlus
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

const EXAMPLE_PRS = [
  'https://github.com/facebook/react/pull/28103',
  'https://github.com/vercel/next.js/pull/62821',
  'https://github.com/tailwindlabs/tailwindcss/pull/13555',
]

function TokenInput({ githubToken, setGithubToken }) {
  const [showToken, setShowToken] = useState(false)
  const [focused,   setFocused]   = useState(false)
  const hasToken = githubToken.trim().length > 0

  return (
    <div className="space-y-3">
      {/* Label row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound size={13} className="text-accent-400" />
          <span className="text-xs font-semibold text-dark-300">
            GitHub Personal Access Token
          </span>
          <span className="
            px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide font-bold
            bg-white/[0.04] border border-white/[0.06] text-dark-600
          ">
            Optional
          </span>
        </div>
        <a
          href="https://github.com/settings/tokens/new?scopes=public_repo&description=PR+Review+Assistant"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-accent-400 hover:text-accent-200 transition-colors"
        >
          <ExternalLink size={10} />
          Create token
        </a>
      </div>

      {/* Token input */}
      <div className={`
        relative flex items-center rounded-xl transition-all duration-200
        border ${focused
          ? 'border-accent-500/60 shadow-[0_0_0_3px_rgba(108,58,240,0.10)]'
          : 'border-white/[0.07]'}
        bg-dark-950/60
      `}>
        <input
          id="github-token-input"
          type={showToken ? 'text' : 'password'}
          value={githubToken}
          onChange={(e) => setGithubToken(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx  (cleared on page refresh)"
          autoComplete="off"
          spellCheck="false"
          className="
            flex-1 px-4 py-2.5 bg-transparent
            text-sm font-mono text-dark-200 placeholder-dark-700
            outline-none rounded-l-xl
          "
        />
        <div className="flex items-center pr-3 gap-1">
          {hasToken && (
            <button
              type="button"
              onClick={() => setGithubToken('')}
              className="p-1 rounded-md text-dark-600 hover:text-dark-300 transition-colors"
              title="Clear token"
            >
              <X size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowToken(!showToken)}
            className="p-1.5 rounded-md text-dark-500 hover:text-dark-300 transition-colors"
            title={showToken ? 'Hide token' : 'Show token'}
          >
            {showToken ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
      </div>

      {/* Privacy notice */}
      <div className="flex items-start gap-2 px-1">
        <ShieldOff size={11} className="text-dark-600 mt-0.5 shrink-0" />
        <p className="text-[11px] text-dark-600 leading-relaxed">
          <span className="text-dark-400 font-medium">Not stored anywhere.</span>{' '}
          Token is used only for this request and cleared when you leave or refresh the page.
          Needed for private repos or to avoid GitHub rate limits.
          Public repos work without a token.
        </p>
      </div>
    </div>
  )
}

export default function PRInputSection({
  onReview, loading, error, onClear,
  githubToken, setGithubToken,
  postToGitHub, setPostToGitHub,
}) {
  const [url,          setUrl]          = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const inputRef = useRef(null)
  const { user } = useAuth()   // OAuth session state

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!loading) onReview(url)
  }

  const handleExample = (exampleUrl) => {
    setUrl(exampleUrl)
    inputRef.current?.focus()
  }

  const handleClear = () => {
    setUrl('')
    onClear()
    inputRef.current?.focus()
  }

  // Ensure error is always a renderable string
  const errorMessage = typeof error === 'string'
    ? error
    : error
      ? 'An error occurred. Please check the URL and try again.'
      : null

  return (
    <div className="glass-card-accent p-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-start gap-4 mb-7">
        <div className="
          w-12 h-12 rounded-2xl flex items-center justify-center shrink-0
          bg-gradient-to-br from-accent-500/20 to-accent-700/20
          border border-accent-500/30
        ">
          <Sparkles size={22} className="text-accent-300" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-dark-50 mb-1">
            AI Pull Request Review
          </h2>
          <p className="text-sm text-dark-400 leading-relaxed">
            Paste any GitHub Pull Request URL. Our AI acts as a senior staff engineer
            and reviews your code for security, performance, bugs, and best practices.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* PR URL row */}
        <div className="relative flex items-center gap-3">
          <div className="relative flex-1">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-500">
              <GitPullRequest size={16} />
            </div>
            <input
              ref={inputRef}
              id="pr-url-input"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/owner/repo/pull/123"
              className="input-dark pl-10 pr-10 h-12"
              disabled={loading}
              autoComplete="off"
              spellCheck="false"
            />
            {url && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300 transition-colors"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <button
            id="review-submit-btn"
            type="submit"
            className="btn-primary h-12 px-6 shrink-0"
            disabled={loading || !url.trim()}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analyzing…
              </>
            ) : (
              <>
                <Search size={15} />
                Review PR
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </div>

        {/* Post to GitHub Toggle */}
        <div className="flex items-center gap-3 px-1">
          <button
            type="button"
            onClick={() => setPostToGitHub(!postToGitHub)}
            disabled={loading || (!user && !githubToken)}
            className={`
              relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full
              transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2
              focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-900
              disabled:opacity-50 disabled:cursor-not-allowed
              ${postToGitHub ? 'bg-accent-500' : 'bg-white/[0.1]'}
            `}
            role="switch"
            aria-checked={postToGitHub}
          >
            <span className="sr-only">Post review to GitHub</span>
            <span
              className={`
                pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0
                transition duration-200 ease-in-out
                ${postToGitHub ? 'translate-x-2' : '-translate-x-2'}
              `}
            />
          </button>
          <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => { if(user || githubToken) setPostToGitHub(!postToGitHub) }}>
            <MessageSquarePlus size={14} className={postToGitHub ? 'text-accent-400' : 'text-dark-500'} />
            <span className={`text-sm font-medium ${postToGitHub ? 'text-dark-100' : 'text-dark-400'}`}>
              Post review to GitHub
            </span>
            {(!user && !githubToken) && (
              <span className="text-[10px] uppercase tracking-wider text-dark-600 bg-white/[0.05] px-1.5 py-0.5 rounded ml-2">
                Requires Token
              </span>
            )}
          </div>
        </div>

        {/* Error — always renders a string */}
        {errorMessage && (
          <div className="
            flex items-start gap-3 p-4 rounded-xl
            bg-critical/10 border border-critical/25
            animate-fade-in
          ">
            <AlertCircle size={16} className="text-critical shrink-0 mt-0.5" />
            <p className="text-sm text-red-300 leading-relaxed break-words">{errorMessage}</p>
          </div>
        )}

        {/* Auth status — OAuth banner when logged in, manual token input when not */}
        {user ? (
          /* ── OAuth connected banner ───────────────────────────────────── */
          <div className="
            flex items-center gap-3 px-4 py-3 rounded-xl
            bg-low/10 border border-low/25
            animate-fade-in
          ">
            <div className="
              w-8 h-8 rounded-full overflow-hidden border-2 border-low/40 shrink-0
            ">
              <img src={user.avatar_url} alt={user.login} className="w-full h-full" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Lock size={11} className="text-low" />
                <span className="text-xs font-semibold text-low">GitHub OAuth Connected</span>
              </div>
              <p className="text-[11px] text-dark-500 mt-0.5">
                Signed in as <span className="font-mono text-dark-400">@{user.login}</span> — private repositories enabled
              </p>
            </div>
            <CheckCircle2 size={16} className="text-low shrink-0" />
          </div>
        ) : (
          /* ── Manual PAT input (collapsible, session-only) ─────────────── */
          <div className="rounded-xl border border-white/[0.06] overflow-hidden">
            <button
              type="button"
              id="toggle-token-settings"
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="
                w-full flex items-center justify-between px-4 py-3
                bg-white/[0.02] hover:bg-white/[0.04]
                text-xs font-medium text-dark-400 hover:text-dark-200
                transition-colors
              "
            >
              <div className="flex items-center gap-2">
                <KeyRound size={13} className={githubToken ? 'text-accent-400' : 'text-dark-600'} />
                <span>GitHub Token</span>
                <span className="
                  px-2 py-0.5 rounded-full
                  bg-white/[0.04] border border-white/[0.06]
                  text-[10px] text-dark-600 uppercase tracking-wide
                ">
                  {githubToken ? 'Set for this session' : 'Optional — for private repos'}
                </span>
              </div>
              {settingsOpen
                ? <ChevronUp  size={14} className="text-dark-600" />
                : <ChevronDown size={14} className="text-dark-600" />
              }
            </button>

            {settingsOpen && (
              <div className="px-4 pb-4 pt-3 border-t border-white/[0.05] animate-fade-in">
                <TokenInput
                  githubToken={githubToken}
                  setGithubToken={setGithubToken}
                />
              </div>
            )}
          </div>
        )}
      </form>

      {/* Example PRs */}
      <div className="mt-5">
        <p className="text-xs text-dark-600 mb-2.5 font-medium uppercase tracking-wider">
          Try an example (public repo — no token needed)
        </p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_PRS.map((exPr) => {
            const parts = exPr.split('/')
            const label = `${parts[3]}/${parts[4]}#${parts[6]}`
            return (
              <button
                key={exPr}
                onClick={() => handleExample(exPr)}
                disabled={loading}
                className="
                  flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                  text-xs font-mono text-dark-400
                  bg-white/[0.03] border border-white/[0.06]
                  hover:border-accent-500/30 hover:text-accent-300
                  transition-all duration-200 disabled:opacity-40
                "
              >
                <ExternalLink size={10} />
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Feature pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/[0.06]">
        {[
          { label: 'Security Scan', color: 'text-critical' },
          { label: 'Bug Detection', color: 'text-high'     },
          { label: 'Performance',   color: 'text-medium'   },
          { label: 'Code Quality',  color: 'text-low'      },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${color.replace('text', 'bg')} shrink-0`} />
            <span className={`text-xs font-medium ${color}`}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
