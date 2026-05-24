import { motion, AnimatePresence } from 'framer-motion'
import {
  GitPullRequest, Cpu, Brain, Shield, Zap,
  MessageSquarePlus, CheckCircle2,
} from 'lucide-react'

const STEPS = [
  {
    icon: GitPullRequest,
    label: 'Fetching Pull Request',
    sublabel: 'Authenticating & retrieving PR metadata…',
    key: 'fetch',
  },
  {
    icon: Cpu,
    label: 'Processing Diff',
    sublabel: 'Parsing hunks, filtering noise, chunking…',
    key: 'diff',
  },
  {
    icon: Shield,
    label: 'Running Security Scan',
    sublabel: 'Checking credentials, injections, SSRF, XSS…',
    key: 'security',
  },
  {
    icon: Zap,
    label: 'Performance Analysis',
    sublabel: 'Detecting N+1 queries, blocking I/O, memory leaks…',
    key: 'perf',
  },
  {
    icon: Brain,
    label: 'Generating AI Review',
    sublabel: 'Principal engineer analysis in progress…',
    key: 'ai',
  },
  {
    icon: MessageSquarePlus,
    label: 'Posting GitHub Comments',
    sublabel: 'Writing inline review comments to your PR…',
    key: 'post',
  },
  {
    icon: CheckCircle2,
    label: 'Review Complete',
    sublabel: 'All findings compiled and delivered.',
    key: 'done',
  },
]

function resolveStep(status) {
  if (!status) return 4 // default to AI step
  const s = status.toLowerCase()
  if (s.includes('fetching') || s.includes('github'))            return 0
  if (s.includes('processing') || s.includes('diff'))           return 1
  if (s.includes('security'))                                    return 2
  if (s.includes('performance'))                                 return 3
  if (s.includes('posting') || s.includes('comment'))           return 5
  if (s.includes('complete') || s.includes('done'))             return 6
  return 4 // AI review
}

export default function LoadingState({ status }) {
  const currentStep = resolveStep(status)
  const progress = Math.round(((currentStep + 0.5) / STEPS.length) * 100)

  return (
    <div className="glass-card p-8 animate-fade-in">
      {/* Animated orb */}
      <div className="relative mb-8 flex justify-center">
        <div className="
          w-24 h-24 rounded-full
          bg-gradient-to-br from-accent-600/30 to-accent-400/10
          border border-accent-500/30
          flex items-center justify-center
          animate-pulse-glow
        ">
          <Brain size={36} className="text-accent-400 animate-float" />
        </div>
        {/* Orbiting dot */}
        <div className="absolute inset-0 flex items-center justify-center animate-spin-slow">
          <div className="
            relative w-24 h-24
          ">
            <div className="
              absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2
              w-3 h-3 rounded-full bg-accent-400
              shadow-[0_0_8px_rgba(108,58,240,0.8)]
            " />
          </div>
        </div>
      </div>

      <h3 className="text-xl font-bold text-dark-50 mb-1 text-center">
        AI Reviewing Your Code
      </h3>
      <p className="text-sm text-dark-400 mb-6 text-center max-w-sm mx-auto leading-relaxed">
        {status || 'Analyzing your pull request as a senior principal engineer…'}
      </p>

      {/* Progress bar */}
      <div className="max-w-sm mx-auto mb-8">
        <div className="flex justify-between text-xs text-dark-600 mb-1.5">
          <span>Progress</span>
          <span className="font-mono">{progress}%</span>
        </div>
        <div className="progress-bar">
          <motion.div
            className="progress-fill"
            initial={{ width: '0%' }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Step indicators */}
      <div className="max-w-sm mx-auto space-y-2">
        <AnimatePresence>
          {STEPS.map(({ icon: Icon, label, sublabel, key }, idx) => {
            const done    = idx < currentStep
            const active  = idx === currentStep
            const pending = idx > currentStep

            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: pending ? 0.35 : 1, x: 0 }}
                transition={{ delay: idx * 0.05, duration: 0.3 }}
                className={`
                  flex items-center gap-3.5 p-3 rounded-xl transition-all duration-500
                  ${active  ? 'bg-accent-500/10 border border-accent-500/25' : ''}
                  ${done    ? 'bg-white/[0.015] border border-white/[0.04]'  : ''}
                  ${pending ? 'border border-transparent'                    : ''}
                `}
              >
                {/* Icon */}
                <div className={`
                  w-8 h-8 rounded-lg flex items-center justify-center shrink-0
                  ${active  ? 'bg-accent-500/20 text-accent-300' : ''}
                  ${done    ? 'bg-low/20 text-low'               : ''}
                  ${pending ? 'bg-white/[0.04] text-dark-600'    : ''}
                `}>
                  {done ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <Icon size={15} className={active ? 'animate-pulse' : ''} />
                  )}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0 text-left">
                  <p className={`text-sm font-semibold leading-tight ${
                    active ? 'text-accent-200' : done ? 'text-dark-300' : 'text-dark-600'
                  }`}>
                    {label}
                  </p>
                  {active && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-xs text-dark-500 mt-0.5 leading-snug"
                    >
                      {sublabel}
                    </motion.p>
                  )}
                </div>

                {/* Active spinner */}
                {active && (
                  <div className="w-4 h-4 border-2 border-accent-400/40 border-t-accent-400 rounded-full animate-spin shrink-0" />
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
