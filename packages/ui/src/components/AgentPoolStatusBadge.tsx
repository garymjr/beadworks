/**
 * AgentPoolStatusBadge - Displays detailed agent pool status
 * Shows planning agent status, worker pool metrics, and idle agent count
 * Follows the Digital Abacus design system with glass-morphism styling
 */

import type { AgentPoolStatusResponse } from '../lib/api/types'

interface AgentPoolStatusBadgeProps {
  poolStatus: AgentPoolStatusResponse | undefined
  isLoading?: boolean
  error?: unknown
}

export function AgentPoolStatusBadge({
  poolStatus,
  isLoading = false,
  error,
}: AgentPoolStatusBadgeProps) {
  // Get planning agent status color
  const getPlanningStatusColor = () => {
    if (!poolStatus) return 'bg-slate-600'
    switch (poolStatus.planningAgent.status) {
      case 'active':
        return 'bg-emerald-400'
      case 'idle':
        return 'bg-slate-400'
      case 'error':
        return 'bg-red-400'
      default:
        return 'bg-slate-400'
    }
  }

  // Get planning agent text
  const getPlanningStatusText = () => {
    if (!poolStatus) return 'Loading...'
    switch (poolStatus.planningAgent.status) {
      case 'active':
        return poolStatus.planningAgent.currentIssueId
          ? 'Planning'
          : 'Active'
      case 'idle':
        return 'Idle'
      case 'error':
        return 'Error'
      default:
        return 'Unknown'
    }
  }

  // Calculate worker pool percentage
  const getWorkerPoolPercentage = () => {
    if (!poolStatus || poolStatus.workerPool.totalWorkers === 0) return 0
    return Math.round(
      (poolStatus.workerPool.activeWorkers / poolStatus.workerPool.totalWorkers) * 100,
    )
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 border border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-slate-500 animate-pulse" />
          <span
            className="text-sm text-slate-400"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            Loading agents...
          </span>
        </div>
      </div>
    )
  }

  // Show error state
  if (error || !poolStatus) {
    return (
      <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 border border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span
            className="text-sm text-slate-400"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            Agent status unavailable
          </span>
        </div>
      </div>
    )
  }

  const workerPercentage = getWorkerPoolPercentage()
  const planningPulse = poolStatus.planningAgent.status === 'active' ? 'animate-pulse' : ''

  return (
    <div className="flex items-center gap-4 px-4 py-2 rounded-full bg-white/5 border border-white/10">
      {/* Planning Agent Status */}
      <div className="flex items-center gap-2 border-r border-white/10 pr-4">
        <div className={`w-2 h-2 rounded-full ${getPlanningStatusColor()} ${planningPulse}`} />
        <span
          className="text-xs text-slate-400"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        >
          <span className="text-slate-500">Planning:</span>{' '}
          <span className="text-slate-300">{getPlanningStatusText()}</span>
        </span>
      </div>

      {/* Worker Pool Status */}
      <div className="flex items-center gap-2 border-r border-white/10 pr-4">
        <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full transition-all duration-300"
            style={{ width: `${workerPercentage}%` }}
          />
        </div>
        <span
          className="text-xs text-slate-400"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        >
          <span className="text-slate-500">Workers:</span>{' '}
          <span className="text-slate-300">
            {poolStatus.workerPool.activeWorkers}/{poolStatus.workerPool.totalWorkers}
          </span>
        </span>
      </div>

      {/* Idle Agents Count */}
      <div className="flex items-center gap-2">
        <span
          className="text-xs text-slate-400"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        >
          <span className="text-slate-500">Idle:</span>{' '}
          <span className="text-slate-300">{poolStatus.workerPool.idleWorkers}</span>
        </span>
      </div>
    </div>
  )
}
