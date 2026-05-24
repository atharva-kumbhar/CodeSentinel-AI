const SEVERITY_CONFIG = {
  Critical: {
    dot:     'bg-critical',
    class:   'badge-critical',
    label:   'Critical',
    ring:    'ring-critical/30',
  },
  High: {
    dot:     'bg-high',
    class:   'badge-high',
    label:   'High',
    ring:    'ring-high/30',
  },
  Medium: {
    dot:     'bg-medium',
    class:   'badge-medium',
    label:   'Medium',
    ring:    'ring-medium/30',
  },
  Low: {
    dot:     'bg-low',
    class:   'badge-low',
    label:   'Low',
    ring:    'ring-low/30',
  },
}

export default function SeverityBadge({ severity, size = 'md' }) {
  const config = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG['Low']

  return (
    <span className={`${config.class} ${size === 'sm' ? 'text-[10px] px-2 py-0.5' : ''}`}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  )
}

export { SEVERITY_CONFIG }
