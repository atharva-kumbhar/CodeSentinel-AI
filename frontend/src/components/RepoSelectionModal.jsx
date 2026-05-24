/**
 * RepoSelectionModal.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Post-login popup that lets the user choose which GitHub repos to monitor.
 * Appears automatically after OAuth login (when ?auth=success is detected).
 *
 * Options:
 *   1. Monitor All Repositories
 *   2. Monitor Specific Repositories (searchable multi-select list)
 *
 * Saves to Firebase via POST /api/monitoring/config
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Search, Check, GitBranch, Globe, Lock, Loader2,
  MonitorCheck, ChevronRight, Sparkles, RefreshCw,
  FolderGit2, Star, Clock,
} from 'lucide-react'
import monitoringApi from '../api/monitoringApi'

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(isoStr) {
  if (!isoStr) return ''
  const diff = Date.now() - new Date(isoStr).getTime()
  const d = Math.floor(diff / 86400000)
  if (d === 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 30)  return `${d}d ago`
  const m = Math.floor(d / 30)
  if (m < 12)  return `${m}mo ago`
  return `${Math.floor(m / 12)}y ago`
}

const LANG_COLORS = {
  JavaScript: '#f7df1e', TypeScript: '#3178c6', Python: '#3572a5',
  Go: '#00add8', Rust: '#dea584', Java: '#b07219', 'C#': '#178600',
  'C++': '#f34b7d', Ruby: '#701516', PHP: '#4f5d95', Swift: '#fa7343',
  Kotlin: '#7f52ff', Dart: '#00b4ab', Vue: '#41b883', HTML: '#e34c26',
  CSS: '#563d7c',
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function LangDot({ lang }) {
  const color = LANG_COLORS[lang]
  if (!lang) return null
  return (
    <span className="flex items-center gap-1 text-[10px] text-dark-500">
      <span
        className="inline-block w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: color || '#666' }}
      />
      {lang}
    </span>
  )
}

function RepoRow({ repo, selected, onToggle }) {
  return (
    <motion.button
      layout
      onClick={() => onToggle(repo.full_name)}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left
        transition-all duration-150
        ${selected
          ? 'bg-accent-500/15 border border-accent-500/30'
          : 'bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.10]'
        }`}
    >
      {/* Checkbox */}
      <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors
        ${selected
          ? 'bg-accent-500 border-accent-500'
          : 'border-white/[0.2] bg-transparent'
        }`}>
        {selected && <Check size={10} strokeWidth={3} className="text-white" />}
      </div>

      {/* Repo icon */}
      <div className="w-7 h-7 rounded-lg bg-white/[0.05] flex items-center justify-center shrink-0">
        <FolderGit2 size={13} className="text-dark-400" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-dark-100 truncate">{repo.full_name}</span>
          {/* Visibility badge */}
          {repo.private ? (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-[9px] font-semibold text-amber-400 shrink-0">
              <Lock size={8} /> Private
            </span>
          ) : (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-low/10 border border-low/20 text-[9px] font-semibold text-low shrink-0">
              <Globe size={8} /> Public
            </span>
          )}
          {repo.fork && (
            <span className="px-1.5 py-0.5 rounded-md bg-white/[0.05] text-[9px] text-dark-600 shrink-0">fork</span>
          )}
        </div>
        {repo.description && (
          <p className="text-[11px] text-dark-500 truncate mt-0.5">{repo.description}</p>
        )}
        <div className="flex items-center gap-3 mt-1">
          <LangDot lang={repo.language} />
          {repo.stars > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-dark-600">
              <Star size={9} /> {repo.stars.toLocaleString()}
            </span>
          )}
          {repo.updated_at && (
            <span className="flex items-center gap-1 text-[10px] text-dark-600">
              <Clock size={9} /> {timeAgo(repo.updated_at)}
            </span>
          )}
        </div>
      </div>

      {/* Selected indicator */}
      {selected && (
        <div className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-pulse shrink-0" />
      )}
    </motion.button>
  )
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export default function RepoSelectionModal({ open, onClose, username }) {
  const [mode, setMode]               = useState('all')       // 'all' | 'specific'
  const [repos, setRepos]             = useState([])
  const [loadingRepos, setLoadingR]   = useState(false)
  const [repoError, setRepoError]     = useState('')
  const [search, setSearch]           = useState('')
  const [selected, setSelected]       = useState(new Set())   // Set of full_names
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [saveError, setSaveError]     = useState('')
  const [configLoading, setConfigLoading] = useState(false)
  const searchRef = useRef(null)

  // Fetch repos when switching to specific mode
  const fetchRepos = useCallback(async () => {
    setLoadingR(true)
    setRepoError('')
    try {
      const { repos: list } = await monitoringApi.fetchUserRepos()
      setRepos(list || [])
    } catch (e) {
      setRepoError(e.response?.data?.detail || e.message || 'Failed to load repositories.')
    } finally {
      setLoadingR(false)
    }
  }, [])

  const loadConfig = useCallback(async () => {
    setConfigLoading(true)
    try {
      const { config } = await monitoringApi.getMonitoringConfig()
      const monitorAll = config?.monitor_all_repositories ?? true
      setMode(monitorAll ? 'all' : 'specific')
      setSelected(new Set(config?.selected_repositories || []))
    } catch {
      setMode('all')
      setSelected(new Set())
    } finally {
      setConfigLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    queueMicrotask(() => {
      setSaved(false)
      setSaveError('')
      setRepoError('')
      loadConfig()
      fetchRepos()
    })
  }, [open, loadConfig, fetchRepos])

  // Focus search when switching to specific
  useEffect(() => {
    if (mode === 'specific') {
      setTimeout(() => searchRef.current?.focus(), 100)
    }
  }, [mode])

  // Filtered repo list
  const filtered = repos.filter(r =>
    r.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (r.description || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.language || '').toLowerCase().includes(search.toLowerCase())
  )

  const toggleRepo = (fullName) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(fullName)) next.delete(fullName)
      else next.add(fullName)
      return next
    })
  }

  const selectAll   = () => setSelected(new Set(filtered.map(r => r.full_name)))
  const clearAll    = () => setSelected(new Set())

  const handleSave = async () => {
    if (mode === 'specific' && selected.size === 0) {
      setSaveError('Please select at least one repository to monitor.')
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      await monitoringApi.saveMonitoringConfig(
        mode === 'all',
        mode === 'specific' ? Array.from(selected) : [],
        true
      )
      setSaved(true)
      setTimeout(() => {
        onClose(true)   // true = config was saved
      }, 1200)
    } catch (e) {
      setSaveError(e.response?.data?.detail || e.message || 'Failed to save monitoring configuration.')
      setSaving(false)
    }
  }

  const canSave = mode === 'all' || selected.size > 0

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm"
            onClick={() => onClose(false)}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="pointer-events-auto w-full max-w-2xl max-h-[90vh] flex flex-col
                rounded-2xl border border-white/[0.1]
                bg-dark-950/95 backdrop-blur-2xl shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              {/* ── Header ── */}
              <div className="flex items-start justify-between p-6 pb-4 border-b border-white/[0.06]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-500/15 border border-accent-500/25 flex items-center justify-center">
                    <MonitorCheck size={18} className="text-accent-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-dark-50">Configure Repository Monitoring</h2>
                    <p className="text-xs text-dark-500 mt-0.5">
                      {username ? `Connected as @${username} · ` : ''}{repos.length ? `${repos.length} repositories available` : 'Loading GitHub repositories'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => onClose(false)}
                  className="p-1.5 rounded-lg text-dark-500 hover:text-dark-200 hover:bg-white/[0.05] transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* ── Mode Selection ── */}
              <div className="p-6 pb-4 space-y-3">
                <p className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-3">
                  What to Monitor
                </p>

                {/* Monitor All */}
                <button
                  onClick={() => setMode('all')}
                  disabled={configLoading}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${
                    mode === 'all'
                      ? 'bg-accent-500/12 border-accent-500/35 shadow-[0_0_20px_rgba(139,92,246,0.08)]'
                      : 'bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.05]'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                    mode === 'all' ? 'border-accent-500 bg-accent-500' : 'border-white/[0.3]'
                  }`}>
                    {mode === 'all' && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-dark-100">Monitor All Repositories</span>
                      <span className="px-2 py-0.5 rounded-full bg-accent-500/15 text-[10px] font-semibold text-accent-400 border border-accent-500/20">
                        Recommended
                      </span>
                    </div>
                    <p className="text-xs text-dark-500 mt-0.5">
                      Auto-review PRs in every repository returned by your GitHub account
                    </p>
                  </div>
                  <Sparkles size={16} className={mode === 'all' ? 'text-accent-400' : 'text-dark-600'} />
                </button>

                {/* Monitor Specific */}
                <button
                  onClick={() => setMode('specific')}
                  disabled={configLoading}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${
                    mode === 'specific'
                      ? 'bg-accent-500/12 border-accent-500/35 shadow-[0_0_20px_rgba(139,92,246,0.08)]'
                      : 'bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.05]'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                    mode === 'specific' ? 'border-accent-500 bg-accent-500' : 'border-white/[0.3]'
                  }`}>
                    {mode === 'specific' && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-semibold text-dark-100">Select Specific Repositories</span>
                    <p className="text-xs text-dark-500 mt-0.5">
                      Choose exactly which repos to monitor — ideal for large accounts
                    </p>
                  </div>
                  <ChevronRight size={16} className={mode === 'specific' ? 'text-accent-400' : 'text-dark-600'} />
                </button>
              </div>

              {/* ── Repo List (specific mode) ── */}
              <AnimatePresence>
                {mode === 'specific' && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22 }}
                    className="flex-1 flex flex-col min-h-0 overflow-hidden border-t border-white/[0.06]"
                  >
                    {/* Search + select-all bar */}
                    <div className="flex items-center gap-2 px-6 py-3 border-b border-white/[0.04]">
                      <div className="flex-1 relative">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-600" />
                        <input
                          ref={searchRef}
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                          placeholder="Search repositories…"
                          className="w-full pl-8 pr-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08]
                            text-sm text-dark-200 placeholder:text-dark-600
                            focus:outline-none focus:ring-1 focus:ring-accent-500/40 focus:border-accent-500/30"
                        />
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          onClick={selectAll}
                          disabled={loadingRepos}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] text-dark-400 hover:text-dark-200
                            border border-white/[0.07] hover:border-white/[0.12] transition-colors disabled:opacity-40"
                        >
                          All
                        </button>
                        <button
                          onClick={clearAll}
                          disabled={loadingRepos || selected.size === 0}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] text-dark-400 hover:text-dark-200
                            border border-white/[0.07] hover:border-white/[0.12] transition-colors disabled:opacity-40"
                        >
                          Clear
                        </button>
                        <button
                          onClick={fetchRepos}
                          disabled={loadingRepos}
                          className="p-1.5 rounded-lg text-dark-500 hover:text-dark-300
                            border border-white/[0.07] hover:border-white/[0.12] transition-colors"
                          title="Refresh"
                        >
                          <RefreshCw size={12} className={loadingRepos ? 'animate-spin' : ''} />
                        </button>
                      </div>
                    </div>

                    {/* Selected count */}
                    {selected.size > 0 && (
                      <div className="px-6 py-2 bg-accent-500/5 border-b border-accent-500/10 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-pulse" />
                        <span className="text-xs text-accent-400 font-medium">
                          {selected.size} {selected.size === 1 ? 'repository' : 'repositories'} selected
                        </span>
                      </div>
                    )}

                    {/* Repo list */}
                    <div className="flex-1 overflow-y-auto px-6 py-3 space-y-1.5 min-h-[200px] max-h-[320px]">
                      {loadingRepos ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-3">
                          <Loader2 size={22} className="animate-spin text-accent-500" />
                          <p className="text-sm text-dark-500">Loading your repositories…</p>
                        </div>
                      ) : repoError ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                          <p className="text-sm text-red-400">{repoError}</p>
                          <button
                            onClick={fetchRepos}
                            className="text-xs text-accent-400 hover:text-accent-300 underline"
                          >
                            Retry
                          </button>
                        </div>
                      ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                          <GitBranch size={22} className="text-dark-600" />
                          <p className="text-sm text-dark-500">
                            {search ? 'No repositories match your search.' : 'No repositories found.'}
                          </p>
                        </div>
                      ) : (
                        filtered.map(repo => (
                          <RepoRow
                            key={repo.full_name}
                            repo={repo}
                            selected={selected.has(repo.full_name)}
                            onToggle={toggleRepo}
                          />
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Footer ── */}
              <div className="p-6 pt-4 border-t border-white/[0.06] flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {saveError && (
                    <p className="text-xs text-red-400">{saveError}</p>
                  )}
                  {saved && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-xs text-low flex items-center gap-1.5"
                    >
                      <Check size={12} /> Configuration saved!
                    </motion.p>
                  )}
                  {!saveError && !saved && mode === 'specific' && selected.size > 0 && (
                    <p className="text-xs text-dark-500">
                      Monitoring <span className="text-dark-300 font-medium">{selected.size}</span>{' '}
                      {selected.size === 1 ? 'repository' : 'repositories'}
                    </p>
                  )}
                  {!saveError && !saved && mode === 'all' && (
                    <p className="text-xs text-dark-500">
                      {repos.length ? `${repos.length} accessible repositories will be auto-reviewed` : 'All accessible repositories will be auto-reviewed'}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onClose(false)}
                    className="px-4 py-2 rounded-xl text-sm text-dark-400 hover:text-dark-200
                      border border-white/[0.07] hover:border-white/[0.12] transition-colors"
                  >
                    Skip for now
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || saved || !canSave}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold
                      bg-accent-500 hover:bg-accent-400 text-white
                      disabled:opacity-50 disabled:cursor-not-allowed
                      transition-colors shadow-lg shadow-accent-500/20"
                  >
                    {saving ? (
                      <><Loader2 size={14} className="animate-spin" /> Saving…</>
                    ) : saved ? (
                      <><Check size={14} /> Saved!</>
                    ) : (
                      <>
                        <MonitorCheck size={14} />
                        {mode === 'all' ? 'Enable Monitoring' : `Monitor ${selected.size || ''} Repos`}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
