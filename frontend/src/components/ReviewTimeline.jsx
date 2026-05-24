import { motion } from 'framer-motion'
import {
  PlayCircle,
  FileCode2,
  ShieldCheck,
  Sparkles,
  GitPullRequest,
} from 'lucide-react'

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(ms) {
  if (!ms || ms <= 0) return '0s'
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  const rem = (s % 60).toFixed(0).padStart(2, '0')
  return `${m}m ${rem}s`
}

// Derive a rough wall-clock timestamp offset for each event.
// Since we only have total review_time_ms, we spread events evenly.
function deriveTimestamps(review) {
  const total = review?.review_time_ms ?? 0
  const posted = review?.github_review_posted ?? false
  const eventCount = posted ? 5 : 4

  return Array.from({ length: eventCount }, (_, i) => {
    const fraction = total > 0 ? ((i / (eventCount - 1)) * total) : 0
    return fraction
  })
}

// ── Individual timeline event ────────────────────────────────────────────────

const EVENT_CONFIG = [
  {
    icon: PlayCircle,
    dotColor: '#a07dff',
    glowColor: 'rgba(160,125,255,0.4)',
  },
  {
    icon: FileCode2,
    dotColor: '#38bdf8',
    glowColor: 'rgba(56,189,248,0.4)',
  },
  {
    icon: ShieldCheck,
    dotColor: '#f87171',
    glowColor: 'rgba(248,113,113,0.4)',
  },
  {
    icon: Sparkles,
    dotColor: '#6c3af0',
    glowColor: 'rgba(108,58,240,0.45)',
  },
  {
    icon: GitPullRequest,
    dotColor: '#4ade80',
    glowColor: 'rgba(74,222,128,0.4)',
  },
]

function TimelineEvent({ title, subtitle, offsetMs, index, isLast, dotColor, glowColor, IconComponent }) {
  const timeLabel = offsetMs > 0 ? `+${formatDuration(offsetMs)}` : 'start'

  return (
    <motion.div
      className="flex items-start gap-4"
      initial={{ opacity: 0, x: -18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.38, delay: index * 0.12, ease: 'easeOut' }}
    >
      {/* Left column: dot + line */}
      <div className="flex flex-col items-center shrink-0" style={{ width: 32 }}>
        {/* Dot */}
        <div
          className="relative z-10 flex items-center justify-center rounded-full shrink-0"
          style={{
            width: 32,
            height: 32,
            background: `${dotColor}18`,
            border: `1.5px solid ${dotColor}50`,
            boxShadow: `0 0 10px ${glowColor}`,
          }}
        >
          <IconComponent size={15} style={{ color: dotColor }} />
        </div>

        {/* Connector line */}
        {!isLast && (
          <motion.div
            className="w-px mt-1"
            style={{
              background: `linear-gradient(to bottom, ${dotColor}40, transparent)`,
              minHeight: 36,
              flex: 1,
            }}
            initial={{ scaleY: 0, originY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 0.35, delay: index * 0.12 + 0.2, ease: 'easeOut' }}
          />
        )}
      </div>

      {/* Right column: text */}
      <div className="pb-6 flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="text-sm font-semibold text-dark-100">{title}</span>
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded"
            style={{
              background: 'rgba(255,255,255,0.04)',
              color: 'var(--text-muted)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {timeLabel}
          </span>
        </div>
        {subtitle && (
          <p className="text-xs text-dark-500 leading-relaxed mt-0.5">{subtitle}</p>
        )}
      </div>
    </motion.div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function ReviewTimeline({ review }) {
  if (!review) return null

  const {
    summary,
    total_issues = 0,
    critical_count = 0,
    high_count = 0,
    files_analyzed,
    review_time_ms = 0,
    github_review_posted = false,
    github_review_url,
    model_used,
  } = review

  const fileCount = Array.isArray(files_analyzed)
    ? files_analyzed.length
    : typeof files_analyzed === 'number'
    ? files_analyzed
    : 0

  const modelLabel = model_used
    ? model_used.split('/').pop().replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'AI Model'

  // Build events array
  const events = [
    {
      title: 'PR Analysis Started',
      subtitle: summary ? `"${summary.slice(0, 90)}${summary.length > 90 ? '…' : ''}"` : 'Fetching diff and metadata…',
    },
    {
      title: 'Diff Processed',
      subtitle: `${fileCount} file${fileCount !== 1 ? 's' : ''} analyzed`,
    },
    {
      title: 'Security Scan Complete',
      subtitle: [
        critical_count > 0 && `${critical_count} critical`,
        high_count > 0 && `${high_count} high`,
      ]
        .filter(Boolean)
        .join(', ') || 'No critical or high severity issues found',
    },
    {
      title: 'AI Review Generated',
      subtitle: `${total_issues} issue${total_issues !== 1 ? 's' : ''} found · Model: ${modelLabel}`,
    },
    ...(github_review_posted
      ? [
          {
            title: 'GitHub Comments Posted',
            subtitle: null,
            link: github_review_url,
          },
        ]
      : []),
  ]

  const timestamps = deriveTimestamps(review)

  return (
    <div className="glass-card p-6">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-6">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: 'rgba(108,58,240,0.15)',
            border: '1px solid rgba(108,58,240,0.25)',
          }}
        >
          <PlayCircle size={15} className="text-accent-300" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-dark-100">Review Timeline</h3>
          <p className="text-xs text-dark-500 mt-0.5">
            Completed in {formatDuration(review_time_ms)}
          </p>
        </div>
      </div>

      {/* Timeline events */}
      <div>
        {events.map((event, index) => {
          const cfg = EVENT_CONFIG[index] ?? EVENT_CONFIG[EVENT_CONFIG.length - 1]
          const isLast = index === events.length - 1

          // Build subtitle, possibly with a link
          let subtitle = event.subtitle
          if (event.link) {
            subtitle = (
              <a
                href={event.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-accent-300 hover:text-accent-200 underline underline-offset-2 transition-colors"
              >
                View on GitHub →
              </a>
            )
          }

          return (
            <TimelineEvent
              key={index}
              index={index}
              title={event.title}
              subtitle={subtitle}
              offsetMs={timestamps[index] ?? 0}
              isLast={isLast}
              dotColor={cfg.dotColor}
              glowColor={cfg.glowColor}
              IconComponent={cfg.icon}
            />
          )
        })}
      </div>
    </div>
  )
}
