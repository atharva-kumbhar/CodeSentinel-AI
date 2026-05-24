import {
  GitPullRequest, Shield, Zap, Code2, Activity,
  Cpu, Settings, HelpCircle, ChevronRight, Layers,
} from 'lucide-react'
import GitHubAuthButton from './GitHubAuthButton'
import { useAuth } from '../context/AuthContext'

const navItems = [
  { id: 'review',      icon: GitPullRequest, label: 'PR Review',    badge: null,  filter: null          },
  { id: 'security',    icon: Shield,         label: 'Security',      badge: 'New', filter: 'Security'    },
  { id: 'performance', icon: Zap,            label: 'Performance',   badge: null,  filter: 'Performance' },
  { id: 'code',        icon: Code2,          label: 'Code Quality',  badge: null,  filter: null          },
  { id: 'analytics',   icon: Activity,       label: 'Analytics',     badge: null,  filter: null          },
]

const bottomItems = [
  { icon: Settings,   label: 'Settings' },
  { icon: HelpCircle, label: 'Help'     },
]

export default function Sidebar({ activeView, onNavigate, reviewIssueCount }) {
  const { user } = useAuth()

  return (
    <aside className="
      w-60 shrink-0 h-screen sticky top-0
      flex flex-col
      border-r border-white/[0.06]
      bg-dark-950/80 backdrop-blur-xl
    ">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="
            w-9 h-9 rounded-xl flex items-center justify-center
            bg-gradient-to-br from-accent-500 to-accent-700
            shadow-glow animate-pulse-glow
          ">
            <GitPullRequest size={18} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-dark-50 leading-tight">PR Reviewer</p>
            <p className="text-[10px] text-dark-500 font-medium tracking-wider uppercase">AI-Powered</p>
          </div>
        </div>
      </div>

      {/* NVIDIA badge */}
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <div className="
          flex items-center gap-2 px-3 py-2 rounded-lg
          bg-white/[0.03] border border-white/[0.05]
          text-xs text-dark-400
        ">
          <Cpu size={13} />
          <span className="font-mono">NVIDIA NIM Powered</span>
          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-low animate-pulse" />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-dark-600 px-3 mb-3">
          Navigation
        </p>
        {navItems.map(({ id, icon: Icon, label, badge }) => (
          <button
            key={id}
            id={`nav-${id}`}
            onClick={() => onNavigate(id)}
            className={`nav-item w-full text-left ${activeView === id ? 'active' : ''}`}
          >
            <Icon size={16} />
            <span className="flex-1">{label}</span>

            {/* Live review issue count badge on PR Review item */}
            {id === 'review' && reviewIssueCount > 0 && (
              <span className="
                text-[9px] font-bold
                px-1.5 py-0.5 rounded-full
                bg-accent-500/20 text-accent-300 border border-accent-500/30
              ">{reviewIssueCount}</span>
            )}

            {badge && id !== 'review' && (
              <span className="
                text-[9px] font-bold uppercase tracking-wider
                px-1.5 py-0.5 rounded-full
                bg-accent-500/20 text-accent-300 border border-accent-500/30
              ">{badge}</span>
            )}

            {activeView === id && <ChevronRight size={12} className="opacity-50" />}
          </button>
        ))}
      </nav>

      {/* Integration mode banner */}
      <div className="px-4 py-3 border-t border-white/[0.06]">
        <div className="
          rounded-xl p-3
          bg-gradient-to-br from-accent-900/40 to-accent-800/20
          border border-accent-500/20
        ">
          <div className="flex items-center gap-2 mb-1.5">
            <Layers size={13} className="text-accent-300" />
            <p className="text-[11px] font-semibold text-accent-200">2 Review Modes</p>
          </div>
          <p className="text-[10px] text-dark-500 leading-relaxed">
            Web Dashboard + GitHub Action CI/CD. One AI engine.
          </p>
        </div>
      </div>

      {/* GitHub Auth section */}
      <div className="px-3 py-3 border-t border-white/[0.06]">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-dark-600 px-1 mb-2.5">
          GitHub Account
        </p>
        <GitHubAuthButton compact={false} />
      </div>



      {/* Bottom nav */}
      <div className="px-3 pb-4 pt-2 space-y-1 border-t border-white/[0.06]">
        {bottomItems.map(({ icon: Icon, label }) => (
          <button key={label} className="nav-item w-full text-left">
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
    </aside>
  )
}
