export default function StatsCard({ label, value, icon: Icon, color = 'accent', sublabel }) {
  const colorMap = {
    accent:   { bg: 'from-accent-600/20 to-accent-800/10', border: 'border-accent-500/20', text: 'text-accent-300',  icon: 'text-accent-400'  },
    critical: { bg: 'from-critical/15 to-critical/5',      border: 'border-critical/20',   text: 'text-red-300',     icon: 'text-critical'    },
    high:     { bg: 'from-high/15 to-high/5',              border: 'border-high/20',        text: 'text-orange-300',  icon: 'text-high'        },
    medium:   { bg: 'from-medium/15 to-medium/5',          border: 'border-medium/20',      text: 'text-yellow-300',  icon: 'text-medium'      },
    low:      { bg: 'from-low/15 to-low/5',                border: 'border-low/20',         text: 'text-green-300',   icon: 'text-low'         },
    info:     { bg: 'from-info/15 to-info/5',              border: 'border-info/20',        text: 'text-sky-300',     icon: 'text-info'        },
  }

  const c = colorMap[color] || colorMap['accent']

  return (
    <div className={`
      stat-card animate-fade-in
      bg-gradient-to-br ${c.bg}
      border ${c.border}
    `}>
      <div className="flex items-center justify-between mb-3">
        <p className="stat-label">{label}</p>
        {Icon && (
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-white/[0.04] ${c.icon}`}>
            <Icon size={15} />
          </div>
        )}
      </div>
      <p className={`stat-value ${c.text}`}>{value}</p>
      {sublabel && <p className="text-xs text-dark-500 mt-1">{sublabel}</p>}
    </div>
  )
}
