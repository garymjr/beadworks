/**
 * ActiveAgentIndicator - Displays active agent status on task cards
 * Shows a pulsing violet dot, status text, and progress bar
 * Follows the bead metaphor with glass-morphism styling
 */

import { useAgentEvents } from '../hooks/useAgentEvents'

interface ActiveAgentIndicatorProps {
  issueId: string
  compact?: boolean // If true, shows minimal indicator (dot + status only)
  onClick?: () => void // Optional click handler to open modal
}

export function ActiveAgentIndicator({
  issueId,
  compact = false,
  onClick,
}: ActiveAgentIndicatorProps) {
  const workState = useAgentEvents(issueId, true)

  // Don't render if no active work
  if (!workState.isActive || workState.isComplete) {
    return null
  }

  const getStatusColor = () => {
    switch (workState.status) {
      case 'starting':
        return 'text-violet-400'
      case 'thinking':
        return 'text-violet-400'
      case 'working':
        return 'text-violet-400'
      case 'complete':
        return 'text-emerald-400'
      case 'error':
        return 'text-red-400'
      case 'cancelled':
        return 'text-slate-400'
      default:
        return 'text-violet-400'
    }
  }

  const getDotColor = () => {
    switch (workState.status) {
      case 'starting':
        return 'bg-violet-400'
      case 'thinking':
        return 'bg-violet-400'
      case 'working':
        return 'bg-violet-400'
      case 'complete':
        return 'bg-emerald-400'
      case 'error':
        return 'bg-red-400'
      case 'cancelled':
        return 'bg-slate-400'
      default:
        return 'bg-violet-400'
    }
  }

  const getGlowColor = () => {
    return 'rgba(139, 92, 246, 0.4)' // violet-500 with opacity
  }

  if (compact) {
    // Compact version: just pulsing dot and status text
    return (
      <div
        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 backdrop-blur-sm transition-all duration-300 ${
          onClick ? 'cursor-pointer hover:bg-white/10 hover:border-white/20' : ''
        }`}
        onClick={onClick}
        style={{ fontFamily: 'JetBrains Mono, monospace' }}
      >
        {/* Pulsing violet dot */}
        <div className="relative">
          <div
            className={`w-2 h-2 rounded-full ${getDotColor()} animate-pulse`}
          />
          {/* Glow effect */}
          <div
            className="absolute inset-0 rounded-full animate-ping"
            style={{
              background: getGlowColor(),
            }}
          />
        </div>

        {/* Status text */}
        <span className="text-xs font-medium text-slate-300">
          {workState.status === 'starting' && 'Starting...'}
          {workState.status === 'thinking' && 'Analyzing...'}
          {workState.status === 'working' && 'Working...'}
        </span>

        {/* Connection indicator */}
        <div
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
            workState.isConnected
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'bg-amber-500/10 text-amber-400'
          }`}
        >
          <div
            className={`w-1 h-1 rounded-full ${
              workState.isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
            }`}
          />
        </div>
      </div>
    )
  }

  // Full version: includes progress bar and current step
  return (
    <div
      className={`mt-3 p-3 rounded-xl bg-slate-900/60 backdrop-blur-sm border border-white/10 transition-all duration-300 ${
        onClick ? 'cursor-pointer hover:bg-slate-900/80 hover:border-violet-500/30 hover:shadow-lg hover:shadow-violet-500/10' : ''
      }`}
      onClick={onClick}
    >
      {/* Header: Status + Connection */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {/* Pulsing violet dot with glow */}
          <div className="relative">
            <div
              className={`w-2.5 h-2.5 rounded-full ${getDotColor()} animate-pulse`}
              style={{
                boxShadow: `0 0 12px ${getGlowColor()}`,
              }}
            />
            {/* Outer glow ring */}
            <div
              className="absolute inset-0 rounded-full animate-ping opacity-75"
              style={{
                background: getGlowColor(),
              }}
            />
          </div>

          {/* Status text */}
          <span
            className={`text-xs font-semibold ${getStatusColor()}`}
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            {workState.status === 'starting' && 'Agent Starting...'}
            {workState.status === 'thinking' && 'Agent Analyzing...'}
            {workState.status === 'working' && 'Agent Working...'}
          </span>
        </div>

        {/* Connection status */}
        <div
          className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${
            workState.isConnected
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'bg-amber-500/10 text-amber-400'
          }`}
        >
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              workState.isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
            }`}
          />
          <span
            className="text-xs font-medium"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            {workState.isConnected ? 'Live' : 'Reconnecting...'}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-2">
        <div className="relative h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-violet-500 to-purple-500 rounded-full transition-all duration-300 ease-out"
            style={{
              width: `${workState.progress}%`,
              boxShadow: workState.progress > 0
                ? `0 0 10px ${getGlowColor()}`
                : 'none',
            }}
          />
        </div>
        <div className="flex items-center justify-between mt-1">
          <span
            className="text-xs text-slate-400 truncate flex-1 mr-2"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            {workState.currentStep}
          </span>
          <span
            className="text-xs text-slate-500 font-medium"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            {workState.progress}%
          </span>
        </div>
      </div>

      {/* Error display */}
      {workState.error && (
        <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-red-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {workState.error.message}
          </p>
        </div>
      )}
    </div>
  )
}
