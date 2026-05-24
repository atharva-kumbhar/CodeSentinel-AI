import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity, GitPullRequest, CheckCircle2, XCircle,
  Loader2, Clock, RefreshCw, Flame, ExternalLink,
  AlertTriangle, Shield,
} from 'lucide-react'
import { useReviewFeed } from '../hooks/useReviewFeed'
import { useAuth } from '../context/AuthContext'
import GitHubAuthButton from './GitHubAuthButton'

function statusConfig(status) {
  switch (status) {
    case 'pending':  return { icon: Clock,      color: 'text-dark-500', bg: 'bg-dark-700/40',    label: 'Queued'    }
    case 'running':  return { icon: RefreshCw,  color: 'text-accent-400', bg: 'bg-accent-500/10', label: 'Running', spin: true }
    case 'complete': return { icon: CheckCircle2, color: 'text-low',     bg: 'bg-low/10',          label: 'Complete' }
    case 'error':    return { icon: XCircle,    color: 'text-red-400',  bg: 'bg-red-500/10',      label: 'Error'    }
    default:         return { icon: Activity,   color: 'text-dark-500', bg: 'bg-white/[0.03]',    label: status     }
  }
}

function timeAgo(isoString) {
  if (!isoString) return ''
  const diff = (Date.now() - new Date(isoString).getTime()) / 1000
  if (diff < 60)   return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function ReviewFeedItem({ review, index }) {
  const cfg = statusConfig(review.status)
  const Icon = cfg.icon

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ delay: index * 0.04 }}
      className="flex items-start gap-3 p-3 rounded-xl hover:bg-white/[0.02] transition-colors group"
    >
      {/* Status icon */}
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.bg}`}>
        <Icon size={14} className={`${cfg.color} ${cfg.spin ? 'animate-spin' : ''}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-dark-200 truncate">
            {review.repo_name || review.repo || 'Unknown Repo'}
          </span>
          {(review.pr_number > 0) && (
            <span className="text-[10px] font-mono text-dark-600">#{review.pr_number}</span>
          )}
          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
            {cfg.label}
          </span>
        </div>

        {review.pr_title && (
          <p className="text-[11px] text-dark-500 truncate mt-0.5">{review.pr_title}</p>
        )}

        {/* Metrics row */}
        {review.status === 'complete' && (
          <div className="flex items-center gap-3 mt-1 text-[10px] text-dark-600">
            {review.total_issues > 0 && (
              <span className="flex items-center gap-1">
                <AlertTriangle size={9} />
                {review.total_issues} issues
              </span>
            )}
            {review.critical_count > 0 && (
              <span className="text-red-400 flex items-center gap-1">
                <Shield size={9} />
                {review.critical_count} critical
              </span>
            )}
            {review.github_posted && (
              <span className="flex items-center gap-1 text-low">
                <CheckCircle2 size={9} />
                Posted to GitHub
              </span>
            )}
          </div>
        )}

        {review.error_msg && review.status === 'error' && (
          <p className="text-[10px] text-red-400 mt-0.5 truncate">{review.error_msg}</p>
        )}
      </div>

      {/* Right side */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[10px] text-dark-600 whitespace-nowrap">{timeAgo(review.created_at)}</span>
        {review.github_url && (
          <a
            href={review.github_url}
            target="_blank"
            rel="noopener noreferrer"
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            title="View on GitHub"
          >
            <ExternalLink size={11} className="text-dark-500 hover:text-accent-300 transition-colors" />
          </a>
        )}
      </div>
    </motion.div>
  )
}

export default function RealtimeFeed() {
  const { user } = useAuth()
  const {
    reviews, feedLoading,
    runningCount, completeCount, errorCount,
  } = useReviewFeed(25)

  if (!user) {
    return (
      <div className="glass-card p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Flame size={16} className="text-accent-400" />
          <h3 className="text-sm font-bold text-dark-50">Live Review Feed</h3>
          <span className="text-[10px] text-dark-600 ml-1">Event-Driven</span>
        </div>
        <div className="text-center py-6 space-y-3">
          <Activity size={28} className="text-dark-700 mx-auto" />
          <p className="text-sm text-dark-500">Sign in with GitHub to see your real-time activity</p>
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
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent-500/15 border border-accent-500/25 flex items-center justify-center">
            <Activity size={15} className="text-accent-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-dark-50">Live Review Feed</h3>
            <p className="text-[10px] text-dark-600 flex items-center gap-1">
              <Flame size={9} className="text-orange-400" />
              Firebase Realtime · Auto-updating
            </p>
          </div>
        </div>

        {/* Stats pills */}
        <div className="flex items-center gap-2">
          {runningCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-accent-500/15 text-accent-300 border border-accent-500/20">
              <RefreshCw size={9} className="animate-spin" />
              {runningCount} running
            </span>
          )}
          {errorCount > 0 && (
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
              {errorCount} errors
            </span>
          )}
          {reviews.length > 0 && (
            <div className="w-1.5 h-1.5 rounded-full bg-low animate-pulse" />
          )}
        </div>
      </div>

      {/* Feed list */}
      <div className="max-h-[500px] overflow-y-auto">
        {feedLoading ? (
          <div className="flex items-center justify-center py-10 gap-2 text-dark-500 text-xs">
            <Loader2 size={14} className="animate-spin" />
            Loading review history…
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-10 space-y-2">
            <GitPullRequest size={28} className="text-dark-700 mx-auto" />
            <p className="text-sm text-dark-500">No reviews yet</p>
            <p className="text-xs text-dark-600">Reviews will appear here as PRs are analyzed</p>
          </div>
        ) : (
          <div className="p-3 space-y-1">
            <AnimatePresence mode="popLayout">
              {reviews.map((review, i) => (
                <ReviewFeedItem key={review.id} review={review} index={i} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Summary footer */}
      {reviews.length > 0 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.04] bg-white/[0.01] text-[10px] text-dark-600">
          <span>{reviews.length} review{reviews.length !== 1 ? 's' : ''} in history</span>
          <span className="flex items-center gap-1 text-low">
            <CheckCircle2 size={9} />
            {completeCount} completed
          </span>
        </div>
      )}
    </div>
  )
}
