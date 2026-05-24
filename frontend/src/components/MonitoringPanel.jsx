import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Radio, Trash2, GitBranch,
  Loader2, CheckCircle2, AlertTriangle,
  Eye, EyeOff, Zap, Flame, SlidersHorizontal, Globe, Lock,
} from 'lucide-react'
import { useMonitoring } from '../hooks/useMonitoring'
import { useAuth } from '../context/AuthContext'
import GitHubAuthButton from './GitHubAuthButton'

function RepoCard({ repo, onToggle, onRemove }) {
  const [removing, setRemoving] = useState(false)

  const handleRemove = async () => {
    setRemoving(true)
    await onRemove(repo.repo_full_name)
    setRemoving(false)
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.07] hover:border-white/[0.12] transition-colors"
    >
      {/* Status dot */}
      <div className={`w-2 h-2 rounded-full shrink-0 ${repo.auto_review_enabled ? 'bg-low animate-pulse' : 'bg-dark-700'}`} />

      {/* Repo info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <GitBranch size={12} className="text-accent-400 shrink-0" />
          <span className="text-sm font-mono font-semibold text-dark-100 truncate">
            {repo.repo_full_name}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-[10px] text-dark-600">
          <span className="flex items-center gap-1"><Zap size={9} />Auto-review</span>
          <span className="flex items-center gap-1">
            {repo.private ? <Lock size={9} /> : <Globe size={9} />}
            {repo.visibility || (repo.private ? 'private' : 'public')}
          </span>
          {repo.language && <span>{repo.language}</span>}
          {repo.webhook_active ? (
            <span className="text-low font-semibold bg-low/10 px-1 py-0.2 rounded border border-low/20">Webhook Active</span>
          ) : (
            <span className="text-medium font-semibold bg-medium/10 px-1 py-0.2 rounded border border-medium/20">Webhook Inactive</span>
          )}
        </div>
      </div>

      {/* Toggle */}
      <button
        onClick={() => onToggle(repo.repo_full_name, !repo.auto_review_enabled)}
        className={`p-1.5 rounded-lg transition-colors ${
          repo.auto_review_enabled
            ? 'text-low hover:bg-low/10'
            : 'text-dark-600 hover:bg-white/[0.05]'
        }`}
        title={repo.auto_review_enabled ? 'Pause monitoring' : 'Resume monitoring'}
      >
        {repo.auto_review_enabled ? <Eye size={13} /> : <EyeOff size={13} />}
      </button>

      {/* Remove */}
      <button
        onClick={handleRemove}
        disabled={removing}
        className="p-1.5 rounded-lg text-dark-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
        title="Remove from monitoring"
      >
        {removing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
      </button>
    </motion.div>
  )
}

export default function MonitoringPanel() {
  const { user, setShowRepoModal } = useAuth()
  const {
    repos, config, monitoringError,
    removeRepo, toggleRepo, saveSettings,
    isMonitoringEnabled,
  } = useMonitoring()

  const handleMasterToggle = async () => {
    if (!isMonitoringEnabled) {
      setShowRepoModal(true)
      return
    }
    await saveSettings({ monitoring_enabled: !isMonitoringEnabled })
  }

  // Not signed in with GitHub
  if (!user) {
    return (
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-accent-500/15 flex items-center justify-center border border-accent-500/25">
            <Radio size={18} className="text-accent-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-dark-50">Continuous PR Monitoring</h3>
            <p className="text-[11px] text-dark-500">Automatic review on every pull request</p>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center space-y-3">
          <Flame size={28} className="text-accent-400 mx-auto" />
          <p className="text-sm text-dark-300">Sign in with GitHub to enable repository monitoring</p>
          <div className="max-w-xs mx-auto">
            <GitHubAuthButton compact={false} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className={`
            w-9 h-9 rounded-xl flex items-center justify-center border
            ${isMonitoringEnabled
              ? 'bg-low/15 border-low/25'
              : 'bg-white/[0.04] border-white/[0.08]'
            }
          `}>
            <Radio size={18} className={isMonitoringEnabled ? 'text-low' : 'text-dark-500'} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-dark-50">Continuous PR Monitoring</h3>
            <p className="text-[11px] text-dark-500">
              {isMonitoringEnabled
                ? config?.monitor_all_repositories
                  ? 'Monitoring all GitHub repositories'
                  : `Monitoring ${repos.length} repositor${repos.length === 1 ? 'y' : 'ies'}`
                : 'Automated review disabled'
              }
            </p>
          </div>
        </div>

        {/* Master toggle */}
        <button
          id="monitoring-master-toggle"
          onClick={handleMasterToggle}
          className={`
            relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300
            ${isMonitoringEnabled ? 'bg-low' : 'bg-dark-700'}
          `}
          role="switch"
          aria-checked={isMonitoringEnabled}
        >
          <span className={`
            inline-block h-4 w-4 rounded-full bg-white shadow-sm
            transform transition-transform duration-300
            ${isMonitoringEnabled ? 'translate-x-6' : 'translate-x-1'}
          `} />
        </button>
      </div>

      {!isMonitoringEnabled && monitoringError && (
        <div className="px-5 py-3 border-t border-white/[0.06]">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-critical/10 border border-critical/20 text-xs text-red-300">
            <AlertTriangle size={12} />
            {monitoringError}
          </div>
        </div>
      )}

      <AnimatePresence>
        {isMonitoringEnabled && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="divide-y divide-white/[0.04]"
          >
            {/* Status bar */}
            <div className="flex items-center gap-4 px-5 py-3 bg-low/5">
              <div className="flex items-center gap-1.5 text-xs text-low">
                <CheckCircle2 size={13} />
                <span className="font-medium">Monitoring Active</span>
              </div>
              <div className="w-1.5 h-1.5 rounded-full bg-low animate-pulse" />
                  <span className="text-[11px] text-dark-500">
                Signed in as {user.name || user.login}
              </span>
            </div>

            {/* Repo list */}
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-dark-500">
                  Monitored Repositories
                </h4>
                <button
                  onClick={() => setShowRepoModal(true)}
                  className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border border-white/[0.08] text-dark-400 hover:text-dark-200 hover:border-white/[0.16] transition-colors"
                >
                  <SlidersHorizontal size={11} />
                  Configure
                </button>
                {repos.length > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-500/15 text-accent-300 border border-accent-500/20 font-bold">
                    {repos.length} active
                  </span>
                )}
              </div>

              <AnimatePresence mode="popLayout">
                {repos.length === 0 ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-4 text-xs text-dark-600"
                  >
                    No repositories selected yet. Use Configure to choose real GitHub repositories.
                  </motion.div>
                ) : (
                  repos.map((repo) => (
                    <RepoCard
                      key={repo.id || repo.repo_full_name}
                      repo={repo}
                      onToggle={toggleRepo}
                      onRemove={removeRepo}
                    />
                  ))
                )}
              </AnimatePresence>

              {/* Error */}
              {monitoringError && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-critical/10 border border-critical/20 text-xs text-red-300">
                  <AlertTriangle size={12} />
                  {monitoringError}
                </div>
              )}

              <button
                onClick={() => setShowRepoModal(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-accent-500 hover:bg-accent-400 text-white transition-colors"
              >
                <SlidersHorizontal size={14} />
                Configure Real GitHub Repositories
              </button>
            </div>

            {/* How it works */}
            <div className="px-5 py-4 bg-white/[0.01]">
              <p className="text-[10px] uppercase tracking-wider text-dark-700 font-semibold mb-2">
                How it works
              </p>
              <div className="space-y-1.5 text-[11px] text-dark-600">
                {[
                  'GitHub webhook → triggers on every new PR',
                  'AI review runs automatically in background',
                  'Inline comments posted directly to GitHub',
                  'Results synced to Firestore in real-time',
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-accent-500 font-bold shrink-0">{i + 1}.</span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
