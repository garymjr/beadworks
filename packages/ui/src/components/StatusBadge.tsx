/**
 * StatusBadge - A reusable badge component for displaying status counts
 * Follows the Digital Abacus design system with glass-morphism styling
 */

interface StatusBadgeProps {
  /** The count number to display */
  count: number
  /** The label text to display after the count */
  label: string
  /** The status type which determines the dot color */
  status?: 'success' | 'error' | 'neutral'
  /** Whether to show the pulse animation on the dot */
  showPulse?: boolean
}

export default function StatusBadge({
  count,
  label,
  status = 'neutral',
  showPulse = false,
}: StatusBadgeProps) {
  const getDotColor = () => {
    switch (status) {
      case 'success':
        return 'bg-emerald-400'
      case 'error':
        return 'bg-red-400'
      case 'neutral':
        return 'bg-slate-400'
      default:
        return 'bg-slate-400'
    }
  }

  const pulseClass = showPulse ? 'animate-pulse' : ''

  return (
    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10">
      <div
        className={`w-2 h-2 rounded-full ${getDotColor()} ${pulseClass}`}
      />
      <span
        className="text-sm text-slate-300"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}
      >
        {count} {label}
      </span>
    </div>
  )
}
