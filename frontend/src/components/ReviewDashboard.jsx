import { useState, useMemo } from 'react'
import {
  AlertTriangle, Shield, Zap, Bug, Layers, Code2,
  FileText, Filter, Brain, Clock, Files,
  TrendingUp, CheckCircle, XCircle, Activity,
} from 'lucide-react'
import { motion } from 'framer-motion'
import StatsCard from './StatsCard'
import IssueCard from './IssueCard'
import CodeViewer from './CodeViewer'
import SeverityBadge from './SeverityBadge'
import ScoreGauge from './ScoreGauge'
import ReviewTimeline from './ReviewTimeline'
import PRMetaCard from './PRMetaCard'

const SEVERITY_ORDER = ['Critical', 'High', 'Medium', 'Low']

const TYPE_ICONS = {
  'Security':             Shield,
  'Performance':          Zap,
  'Bug':                  Bug,
  'Maintainability':      Layers,
  'API Breaking Change':  AlertTriangle,
  'Code Quality':         Code2,
  'Architecture':         Layers,
  'Code Duplication':     FileText,
  'Unsafe Pattern':       AlertTriangle,
  'Reliability':          AlertTriangle,
}

/**
 * ReviewDashboard — main review results UI.
 *
 * Props:
 *   review       — ReviewResponse from backend
 *   activeTab    — current tab string
 *   setActiveTab — setter
 *   llmConfig    — passed down to IssueCard for AI fix generation
 *   filterType   — optional: 'Security' | 'Performance' | null (from Sidebar nav)
 */
export default function ReviewDashboard({ review, activeTab, setActiveTab, llmConfig, filterType }) {
  const [severityFilter, setSeverityFilter] = useState('All')

  // The PR URL — passed down to IssueCard for "Post to GitHub" suggestion button
  const prUrl = review.pr_url || null

  // Group issues by file
  const issuesByFile = useMemo(() => {
    const grouped = {}
    review.issues.forEach((issue) => {
      const key = issue.file || 'unknown'
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(issue)
    })
    return grouped
  }, [review.issues])

  // Apply sidebar filterType first, then severity filter
  const filteredIssues = useMemo(() => {
    let issues = review.issues

    // Sidebar type filter (Security / Performance)
    if (filterType === 'Security') {
      issues = issues.filter(i =>
        ['Security', 'Unsafe Pattern'].includes(i.type)
      )
    } else if (filterType === 'Performance') {
      issues = issues.filter(i => i.type === 'Performance')
    }

    // Severity pill filter
    if (severityFilter !== 'All') {
      issues = issues.filter(i => i.severity === severityFilter)
    }

    return issues
  }, [review.issues, severityFilter, filterType])

  // Severity distribution
  const severityData = [
    { label: 'Critical', count: review.critical_count, color: 'bg-critical', max: review.total_issues },
    { label: 'High',     count: review.high_count,     color: 'bg-high',     max: review.total_issues },
    { label: 'Medium',   count: review.medium_count,   color: 'bg-medium',   max: review.total_issues },
    { label: 'Low',      count: review.low_count,      color: 'bg-low',      max: review.total_issues },
  ]

  const tabs = [
    { id: 'issues',   label: 'Issues',    count: review.total_issues                 },
    { id: 'files',    label: 'By File',   count: Object.keys(issuesByFile).length    },
    { id: 'timeline', label: 'Timeline',  count: null                                },
    { id: 'code',     label: 'Optimized', count: null                                },
  ]

  // Filter badge label
  const filterLabel = filterType
    ? `Filtered: ${filterType} issues only`
    : null

  return (
    <div className="space-y-5 animate-fade-in">

      {/* PR Meta strip */}
      <PRMetaCard review={review} />

      {/* Filter banner (shown when Sidebar filter is active) */}
      {filterLabel && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent-500/10 border border-accent-500/20 text-xs font-medium text-accent-300"
        >
          <Filter size={12} />
          {filterLabel}
          <span className="text-dark-500">— {filteredIssues.length} issue{filteredIssues.length !== 1 ? 's' : ''} shown</span>
        </motion.div>
      )}

      {/* Summary card */}
      <div className="glass-card-accent p-6">
        <div className="flex items-start gap-4">
          <div className="
            w-11 h-11 rounded-xl bg-accent-500/15 border border-accent-500/25
            flex items-center justify-center shrink-0
          ">
            <Brain size={20} className="text-accent-300" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h3 className="text-base font-bold text-dark-50">AI Review Summary</h3>

              {/* Confidence */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-low/10 border border-low/20">
                <div className="w-1.5 h-1.5 rounded-full bg-low animate-pulse" />
                <span className="text-[11px] font-bold text-low">
                  {Math.round(review.confidence_score * 100)}% Confidence
                </span>
              </div>

              {/* Model used */}
              {review.model_used && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.08]">
                  <span className="text-[11px] text-dark-500 font-mono">{review.model_used}</span>
                </div>
              )}
            </div>
            <p className="text-sm text-dark-300 leading-relaxed">{review.summary}</p>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-4 mt-5 pt-5 border-t border-white/[0.05] text-xs text-dark-500">
          <span className="flex items-center gap-1.5">
            <Files size={12} className="text-accent-500" />
            {review.files_analyzed?.length || 0} files analyzed
          </span>
          <span className="flex items-center gap-1.5">
            <Clock size={12} className="text-accent-500" />
            {((review.review_time_ms || 0) / 1000).toFixed(1)}s review time
          </span>
          <span className="flex items-center gap-1.5">
            <TrendingUp size={12} className="text-accent-500" />
            {review.total_issues} total issues
          </span>
          {review.github_review_posted && review.github_review_url && (
            <a
              href={review.github_review_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-low hover:text-low/80 transition-colors"
            >
              <CheckCircle size={12} />
              Posted to GitHub ↗
            </a>
          )}
        </div>
      </div>

      {/* Stats row — 4 severity counts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard label="Total Issues"   value={review.total_issues}    color="accent"    icon={AlertTriangle} />
        <StatsCard label="Critical"       value={review.critical_count}  color="critical"  icon={XCircle}       sublabel="Immediate fix required" />
        <StatsCard label="High"           value={review.high_count}      color="high"      icon={AlertTriangle} sublabel="Fix before merge" />
        <StatsCard label="Medium + Low"   value={review.medium_count + review.low_count} color="low" icon={CheckCircle} sublabel="Consider fixing" />
      </div>

      {/* Score gauges row */}
      {(review.security_score !== undefined || review.performance_score !== undefined) && (
        <div className="grid grid-cols-2 gap-4">
          <div className="glass-card p-5 flex flex-col items-center gap-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-dark-500 mb-2">Security Score</p>
            <ScoreGauge score={Math.round(review.security_score ?? 100)} label="Security" size="md" />
          </div>
          <div className="glass-card p-5 flex flex-col items-center gap-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-dark-500 mb-2">Performance Score</p>
            <ScoreGauge score={Math.round(review.performance_score ?? 100)} label="Performance" size="md" />
          </div>
        </div>
      )}

      {/* Severity distribution bar */}
      <div className="glass-card p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-dark-500 mb-4">
          Severity Distribution
        </p>
        <div className="space-y-3">
          {severityData.map(({ label, count, color, max }) => (
            <div key={label} className="flex items-center gap-3">
              <SeverityBadge severity={label} size="sm" />
              <div className="flex-1 progress-bar">
                <motion.div
                  className={`progress-fill ${color}`}
                  initial={{ width: '0%' }}
                  animate={{ width: max > 0 ? `${(count / max) * 100}%` : '0%' }}
                  transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 }}
                />
              </div>
              <span className="text-xs font-mono font-semibold text-dark-400 w-6 text-right">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 bg-dark-900/50 rounded-xl p-1 border border-white/[0.05]">
        {tabs.map(({ id, label, count }) => (
          <button
            key={id}
            id={`tab-${id}`}
            onClick={() => setActiveTab(id)}
            className={`
              flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
              text-sm font-medium transition-all duration-200
              ${activeTab === id
                ? 'bg-accent-500/15 text-accent-200 border border-accent-500/25'
                : 'text-dark-400 hover:text-dark-200 hover:bg-white/[0.03]'
              }
            `}
          >
            {id === 'timeline' && <Activity size={13} />}
            {label}
            {count !== null && (
              <span className={`
                text-xs px-1.5 py-0.5 rounded-full font-bold
                ${activeTab === id ? 'bg-accent-500/25 text-accent-200' : 'bg-white/[0.06] text-dark-500'}
              `}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'issues' && (
        <div className="space-y-4">
          {/* Severity filter pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter size={13} className="text-dark-600" />
            {['All', ...SEVERITY_ORDER].map((s) => (
              <button
                key={s}
                onClick={() => setSeverityFilter(s)}
                className={`
                  px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200
                  ${severityFilter === s
                    ? 'bg-accent-500/20 text-accent-200 border border-accent-500/30'
                    : 'bg-white/[0.03] text-dark-500 border border-white/[0.05] hover:border-white/10 hover:text-dark-300'
                  }
                `}
              >
                {s}
                {s !== 'All' && (
                  <span className="ml-1.5 opacity-60">
                    ({s === 'Critical' ? review.critical_count
                      : s === 'High'   ? review.high_count
                      : s === 'Medium' ? review.medium_count
                      :                  review.low_count})
                  </span>
                )}
              </button>
            ))}
          </div>

          {filteredIssues.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <CheckCircle size={32} className="text-low mx-auto mb-3" />
              <p className="text-dark-400">No {severityFilter !== 'All' ? severityFilter.toLowerCase() : ''} issues found{filterType ? ` for ${filterType}` : ''}.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredIssues.map((issue, idx) => (
                <IssueCard key={idx} issue={issue} index={idx} llmConfig={llmConfig} prUrl={prUrl} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'files' && (
        <div className="space-y-5">
          {Object.entries(issuesByFile).map(([file, fileIssues]) => (
            <div key={file} className="glass-card overflow-hidden">
              {/* File header */}
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.05] bg-white/[0.02]">
                <FileText size={15} className="text-accent-400" />
                <span className="text-sm font-mono font-semibold text-dark-200 flex-1 truncate">{file}</span>
                <span className="text-xs text-dark-500 shrink-0">{fileIssues.length} issue{fileIssues.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="p-4 space-y-3">
                {fileIssues.map((issue, idx) => (
                  <IssueCard key={idx} issue={issue} index={idx} llmConfig={llmConfig} prUrl={prUrl} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'timeline' && (
        <ReviewTimeline review={review} />
      )}

      {activeTab === 'code' && (
        <CodeViewer
          code={review.optimized_code}
          title="AI-Optimized Code"
        />
      )}
    </div>
  )
}
