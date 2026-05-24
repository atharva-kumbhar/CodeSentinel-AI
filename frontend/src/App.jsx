import { useState, useEffect } from 'react'
import { Bell, Menu, X, Lock, Globe, GitPullRequest } from 'lucide-react'
import Sidebar from './components/Sidebar'
import PRInputSection from './components/PRInputSection'
import ReviewDashboard from './components/ReviewDashboard'
import LoadingState from './components/LoadingState'
import GitHubAuthButton from './components/GitHubAuthButton'
import MonitoringPanel from './components/MonitoringPanel'
import RealtimeFeed from './components/RealtimeFeed'
import RepoSelectionModal from './components/RepoSelectionModal'
import { useReview } from './hooks/useReview'
import { useAuth } from './context/AuthContext'
import ModelSelector from './components/ModelSelector'
import monitoringApi from './api/monitoringApi'

// Map sidebar view IDs to ReviewDashboard filterType prop values
const VIEW_FILTER_MAP = {
  review:      null,
  security:    'Security',
  performance: 'Performance',
  code:        null,
  analytics:   null,
}

function RepoVisibilityBadge({ user }) {
  if (user) {
    return (
      <div className="
        flex items-center gap-1.5 px-3 py-1.5 rounded-full
        bg-low/10 border border-low/20 text-xs font-semibold text-low
      ">
        <Lock size={11} />
        <span className="hidden sm:block">Private repos enabled</span>
      </div>
    )
  }
  return (
    <div className="
      flex items-center gap-1.5 px-3 py-1.5 rounded-full
      bg-white/[0.04] border border-white/[0.08] text-xs text-dark-500
    ">
      <Globe size={11} />
      <span className="hidden sm:block">Public repos only</span>
    </div>
  )
}

/** Small live badge in the top bar showing monitoring status */
function MonitoringStatusBadge({ user, onConfigure, refreshKey }) {
  const [config, setConfig] = useState(null)

  useEffect(() => {
    if (!user) {
      queueMicrotask(() => setConfig(null))
      return
    }
    monitoringApi.getMonitoringConfig()
      .then(({ config: c }) => setConfig(c))
      .catch(() => {})
  }, [user, refreshKey])

  if (!user || !config?.monitoring_enabled) return null

  const label = config.monitor_all_repositories
    ? 'Monitoring all repos'
    : `Monitoring ${config.selected_repositories?.length || 0} repos`

  return (
    <button
      onClick={onConfigure}
      title="Click to change monitoring settings"
      className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full
        bg-low/10 border border-low/20 text-[11px] font-medium text-low
        hover:bg-low/20 transition-colors"
    >
      <div className="w-1.5 h-1.5 rounded-full bg-low animate-pulse" />
      {label}
    </button>
  )
}

function TopBar({ onToggleSidebar, sidebarOpen, llmConfig, setLlmConfig, onConfigure, monitoringRefreshKey }) {
  const { user } = useAuth()

  return (
    <header className="
      h-14 flex items-center justify-between px-6
      border-b border-white/[0.06]
      bg-dark-950/60 backdrop-blur-xl
      sticky top-0 z-40
    ">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 rounded-lg hover:bg-white/[0.05] text-dark-400 hover:text-dark-200 transition-colors"
        >
          {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        <div className="flex items-center gap-2">
          <ModelSelector llmConfig={llmConfig} setLlmConfig={setLlmConfig} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <MonitoringStatusBadge user={user} onConfigure={onConfigure} refreshKey={monitoringRefreshKey} />
        <RepoVisibilityBadge user={user} />
        <div className="w-px h-5 bg-white/[0.07] mx-1 hidden sm:block" />
        <GitHubAuthButton compact={true} />
        <button className="p-2 rounded-lg text-dark-400 hover:text-dark-200 hover:bg-white/[0.05] transition-colors">
          <Bell size={16} />
        </button>
      </div>
    </header>
  )
}

function WelcomeHero({ user }) {
  return (
    <div className="text-center py-12 px-6 animate-fade-in">
      <div className="
        absolute inset-0 pointer-events-none overflow-hidden
        flex items-center justify-center
      " style={{ zIndex: 0 }}>
        <div className="w-[600px] h-[300px] rounded-full bg-accent-600/5 blur-[120px]" />
      </div>
      <div className="relative z-10">
        <div className="
          inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6
          bg-accent-500/10 border border-accent-500/20
          text-xs font-semibold text-accent-300 uppercase tracking-widest
        ">
          <div className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-pulse" />
          {user ? `Reviewing as @${user.login}` : 'AI-Powered Code Review'}
        </div>
        <h1 className="text-4xl sm:text-5xl font-black mb-4 leading-tight">
          <span className="gradient-text">Review PRs</span>
          <br />
          <span className="text-dark-200">Like a Senior Engineer</span>
        </h1>
        <p className="text-dark-400 text-lg max-w-xl mx-auto leading-relaxed">
          {user
            ? `Logged in as ${user.name || user.login}. You can review both public and private repositories.`
            : 'Paste any public GitHub PR URL for an instant AI review. Login with GitHub to also review private repositories.'
          }
        </p>
      </div>
    </div>
  )
}

export default function App() {
  const [activeView,  setActiveView]  = useState('review')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [monitoringRefreshKey, setMonitoringRefreshKey] = useState(0)
  const { user, showRepoModal, setShowRepoModal } = useAuth()

  const {
    review, loading, error, status,
    activeTab, setActiveTab,
    githubToken, setGithubToken,
    postToGitHub, setPostToGitHub,
    llmConfig, setLlmConfig,
    runReview, clearReview,
  } = useReview()

  // When user navigates to a filtered view (Security/Performance),
  // switch to the Issues tab and keep viewing the review
  const handleNavigate = (view) => {
    setActiveView(view)
    setSidebarOpen(false)

    // Switch to 'analytics' tab when Analytics view is selected and review exists
    if (view === 'analytics' && review) {
      setActiveTab('timeline')
    }
    // Switch back to issues tab when returning to main review
    if (view === 'review') {
      setActiveTab('issues')
    }
    // For security/performance — keep issues tab but filterType changes
    if (['security', 'performance'].includes(view) && review) {
      setActiveTab('issues')
    }
  }

  // Determine filterType for ReviewDashboard based on activeView
  const filterType = VIEW_FILTER_MAP[activeView] || null

  return (
    <div className="flex min-h-screen bg-dark-950">
      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 lg:relative lg:z-auto
        transition-transform duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <Sidebar
          activeView={activeView}
          onNavigate={handleNavigate}
          reviewIssueCount={review?.total_issues || 0}
        />
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          sidebarOpen={sidebarOpen}
          llmConfig={llmConfig}
          setLlmConfig={setLlmConfig}
          onConfigure={() => setShowRepoModal(true)}
          monitoringRefreshKey={monitoringRefreshKey}
        />

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">

            {/* Analytics View: Monitoring + Realtime Feed */}
            {activeView === 'analytics' && (
              <div className="pt-6 space-y-6 animate-fade-in">
                <div>
                  <h2 className="text-lg font-bold text-dark-50 mb-1">Monitoring & Analytics</h2>
                  <p className="text-sm text-dark-500 mb-5">
                    Enable continuous PR monitoring and view real-time review activity.
                  </p>
                </div>
                <MonitoringPanel />
                <RealtimeFeed />
              </div>
            )}

            {/* Review Dashboard (only shown for non-analytics views) */}
            {activeView !== 'analytics' && (
              <>
                {/* Hero — show when no review is loaded */}
                {!review && !loading && (
                  <div className="relative">
                    <WelcomeHero user={user} />
                  </div>
                )}

                {/* PR Input */}
                <div className={review || loading ? 'pt-6' : 'pb-8'}>
                  <PRInputSection
                    onReview={runReview}
                    loading={loading}
                    error={error}
                    onClear={clearReview}
                    githubToken={githubToken}
                    setGithubToken={setGithubToken}
                    postToGitHub={postToGitHub}
                    setPostToGitHub={setPostToGitHub}
                    llmConfig={llmConfig}
                  />
                </div>

                {/* Loading */}
                {loading && (
                  <div className="mt-6">
                    <LoadingState status={status} />
                  </div>
                )}

                {/* GitHub review posted banner */}
                {review?.github_review_posted && review?.github_review_url && (
                  <div className="mt-4 flex items-center gap-3 px-5 py-3 rounded-xl
                    bg-low/10 border border-low/25 animate-fade-in">
                    <div className="w-8 h-8 rounded-full bg-low/20 flex items-center justify-center shrink-0">
                      <GitPullRequest size={14} className="text-low" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-low">Review posted to GitHub</p>
                      <p className="text-[11px] text-dark-500 truncate">
                        Inline comments and summary submitted as a{' '}
                        <span className="font-mono">{review.github_review_event || 'COMMENT'}</span> review
                      </p>
                    </div>
                    <a
                      href={review.github_review_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-accent-300 hover:text-accent-200 font-medium whitespace-nowrap flex items-center gap-1"
                    >
                      View on GitHub ↗
                    </a>
                  </div>
                )}

                {/* Review Dashboard */}
                {review && !loading && (
                  <div className="mt-6">
                    <ReviewDashboard
                      review={review}
                      activeTab={activeTab}
                      setActiveTab={setActiveTab}
                      llmConfig={llmConfig}
                      filterType={filterType}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {/* ── Repository Selection Modal (shown once after login) ── */}
      <RepoSelectionModal
        open={showRepoModal}
        onClose={(saved) => {
          setShowRepoModal(false)
          if (saved) setMonitoringRefreshKey(k => k + 1)
        }}
        username={user?.login}
      />
    </div>
  )
}
