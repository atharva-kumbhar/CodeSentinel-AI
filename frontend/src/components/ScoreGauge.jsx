import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

const SIZE_MAP = {
  sm: 80,
  md: 120,
  lg: 160,
}

function getScoreColor(score) {
  if (score >= 80) return '#4ade80'
  if (score >= 50) return '#fbbf24'
  return '#f87171'
}

function getScoreGlow(score) {
  if (score >= 80) return 'rgba(74,222,128,0.25)'
  if (score >= 50) return 'rgba(251,191,36,0.25)'
  return 'rgba(248,113,113,0.25)'
}

export default function ScoreGauge({ score = 0, label = '', size = 'md' }) {
  const clampedScore = Math.min(100, Math.max(0, score))
  const px = SIZE_MAP[size] ?? SIZE_MAP.md

  // Circle geometry
  const strokeWidth = px * 0.085
  const radius = (px - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const cx = px / 2
  const cy = px / 2

  // Font sizes scale with px
  const scoreFontSize = px * 0.22
  const labelFontSize = px * 0.105

  const color = getScoreColor(clampedScore)
  const glow = getScoreGlow(clampedScore)

  // Animated dashoffset
  const [animated, setAnimated] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    timerRef.current = setTimeout(() => setAnimated(true), 80)
    return () => clearTimeout(timerRef.current)
  }, [])

  const targetOffset = circumference - (clampedScore / 100) * circumference
  const dashOffset = animated ? targetOffset : circumference

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="flex flex-col items-center gap-2"
      style={{ width: px }}
    >
      <div className="relative" style={{ width: px, height: px }}>
        <svg
          width={px}
          height={px}
          viewBox={`0 0 ${px} ${px}`}
          style={{ transform: 'rotate(-90deg)' }}
          aria-label={`${label}: ${clampedScore}`}
        >
          {/* Glow filter */}
          <defs>
            <filter id={`glow-${label.replace(/\s+/g, '')}`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation={strokeWidth * 0.6} result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Track ring */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Progress arc */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            filter={`url(#glow-${label.replace(/\s+/g, '')})`}
            style={{
              transition: 'stroke-dashoffset 1s cubic-bezier(0.34, 1.56, 0.64, 1), stroke 0.4s ease',
              willChange: 'stroke-dashoffset',
            }}
          />
        </svg>

        {/* Center text — counter-rotated so it reads normally */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ pointerEvents: 'none' }}
        >
          <motion.span
            key={clampedScore}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            style={{
              fontSize: scoreFontSize,
              fontWeight: 800,
              color,
              fontFamily: 'JetBrains Mono, monospace',
              lineHeight: 1,
              textShadow: `0 0 ${strokeWidth * 1.5}px ${glow}`,
              letterSpacing: '-0.02em',
            }}
          >
            {clampedScore}
          </motion.span>
          <span
            style={{
              fontSize: scoreFontSize * 0.42,
              color: 'rgba(255,255,255,0.35)',
              fontWeight: 500,
              marginTop: 2,
              fontFamily: 'Inter, sans-serif',
            }}
          >
            / 100
          </span>
        </div>
      </div>

      {/* Label below the circle */}
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.35 }}
        style={{
          fontSize: labelFontSize,
          color: 'var(--text-secondary)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontFamily: 'Inter, sans-serif',
          textAlign: 'center',
          maxWidth: px,
        }}
      >
        {label}
      </motion.span>
    </motion.div>
  )
}
