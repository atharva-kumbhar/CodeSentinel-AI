import { motion } from 'framer-motion'
import { Cpu, Files, Clock, CheckCircle2, XCircle, ExternalLink } from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatReviewTime(ms) {
  if (!ms || ms <= 0) return '—'
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  const rem = (s % 60).toFixed(0).padStart(2, '0')
  return `${m}m ${rem}s`
}

function getFileCount(files_analyzed) {
  if (Array.isArray(files_analyzed)) return files_analyzed.length
  if (typeof files_analyzed === 'number') return files_analyzed
  return 0
}

function formatModelName(model_used) {
  if (!model_used) return 'Default AI'
  // Strip provider prefix (e.g. "openai/gpt-4o" → "gpt-4o"), then title-case
  const base = model_used.includes('/') ? model_used.split('/').pop() : model_used
  return base
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatConfidence(confidence_score) {
  if (confidence_score == null) return null
  const pct = Math.round(
    confidence_score > 1 ? confidence_score : confidence_score * 100
  )
  return Math.min(100, Math.max(0, pct))
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetaItem({ icon: Icon, children, className = '' }) {
  return (
    <div className={`flex items-center gap-1.5 shrink-0 ${className}`}>
      <Icon size={12} className="text-dark-500 shrink-0" />
      <span className="text-xs text-dark-400 whitespace-nowrap">{children}</span>
    </div>
  )
}

function Divider() {
  return (
    <span
      className="shrink-0 text-dark-700 select-none hidden sm:inline"
      aria-hidden
    >
      ·
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PRMetaCard({ review }) {
  if (!review) return null

  const {
    model_used,
    files_analyzed,
    review_time_ms,
    confidence_score,
    github_review_posted,
    github_review_url,
  } = review

  const fileCount = getFileCount(files_analyzed)
  const modelName = formatModelName(model_used)
  const reviewTime = formatReviewTime(review_time_ms)
  const confidencePct = formatConfidence(confidence_score)

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="glass-card px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">

        {/* ── Model badge ──────────────────────────────────── */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg shrink-0"
          style={{
            background: 'rgba(108,58,240,0.12)',
            border: '1px solid rgba(108,58,240,0.22)',
          }}
        >
          <Cpu size={12} style={{ color: '#a07dff' }} />
          <span className="text-xs font-semibold" style={{ color: '#a07dff' }}>
            {modelName}
          </span>
        </div>

        <Divider />

        {/* ── Files analyzed ───────────────────────────────── */}
        <MetaItem icon={Files}>
          {fileCount} file{fileCount !== 1 ? 's' : ''}
        </MetaItem>

        <Divider />

        {/* ── Review time ──────────────────────────────────── */}
        <MetaItem icon={Clock}>
          {reviewTime}
        </MetaItem>

        {/* ── Confidence ───────────────────────────────────── */}
        {confidencePct !== null && (
          <>
            <Divider />
            <div className="flex items-center gap-1.5 shrink-0">
              <motion.span
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{
                  background:
                    confidencePct >= 80
                      ? '#4ade80'
                      : confidencePct >= 50
                      ? '#fbbf24'
                      : '#f87171',
                }}
              />
              <span className="text-xs text-dark-400 whitespace-nowrap">
                {confidencePct}% confidence
              </span>
            </div>
          </>
        )}

        {/* ── Spacer pushes GitHub status to the right ─────── */}
        <div className="flex-1 min-w-0" />

        {/* ── GitHub posted status ─────────────────────────── */}
        {github_review_posted ? (
          <motion.a
            href={github_review_url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.3 }}
            className="flex items-center gap-1.5 shrink-0 rounded-lg px-2.5 py-1 transition-colors hover:opacity-80"
            style={{
              background: 'rgba(74,222,128,0.1)',
              border: '1px solid rgba(74,222,128,0.22)',
            }}
          >
            <CheckCircle2 size={12} style={{ color: '#4ade80' }} />
            <span className="text-xs font-semibold" style={{ color: '#4ade80' }}>
              Posted to GitHub
            </span>
            {github_review_url && (
              <ExternalLink size={10} style={{ color: '#4ade80', opacity: 0.7 }} />
            )}
          </motion.a>
        ) : (
          <div
            className="flex items-center gap-1.5 shrink-0 rounded-lg px-2.5 py-1"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <XCircle size={12} className="text-dark-600" />
            <span className="text-xs text-dark-600">Not posted</span>
          </div>
        )}
      </div>
    </motion.div>
  )
}
