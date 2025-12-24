/**
 * WorkProgressCard - Real-time agent work progress display
 * Shows the progress of agent work on an issue
 */

import { useCallback, useEffect, useState } from 'react'
import type { AgentWorkState } from '../hooks/useAgentEvents'
import { cancelWork } from '../lib/api/client'

interface WorkProgressCardProps {
  issueId: string
  issueTitle: string
  projectPath?: string
  startedAt?: number
  workState: AgentWorkState
  onComplete?: () => void
  onError?: () => void
  onCancel?: () => void
  onDismiss?: () => void
  onClick?: () => void
}

export function WorkProgressCard({
  issueId,
  issueTitle,
  projectPath,
  startedAt,
  workState,
  onComplete,
  onError,
  onCancel,
  onDismiss,
  onClick,
}: WorkProgressCardProps) {
  const [elapsed, setElapsed] = useState('0m 0s')

  // Update elapsed time every second
  useEffect(() => {
    if (!startedAt || workState.isComplete) return

    const updateElapsed = () => {
      const now = Date.now()
      const diff = now - startedAt
      const minutes = Math.floor(diff / 60000)
      const seconds = Math.floor((diff % 60000) / 1000)
      setElapsed(`${minutes}m ${seconds}s`)
    }

    updateElapsed()
    const interval = setInterval(updateElapsed, 1000)
    return () => clearInterval(interval)
  }, [startedAt, workState.isComplete])

  const handleCancel = async () => {
    try {
      await cancelWork(issueId)
      onCancel?.()
    } catch (error) {
      console.error('Failed to cancel work:', error)
    }
  }

  const getStatusIcon = () => {
    switch (workState.status) {
      case 'starting':
        return (
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )
      case 'thinking':
        return (
          <svg
            className="w-5 h-5 animate-pulse"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
        )
      case 'working':
        return (
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        )
      case 'complete':
        return (
          <svg
            className="w-5 h-5 text-emerald-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        )
      case 'error':
      case 'cancelled':
        return (
          <svg
            className="w-5 h-5 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        )
    }
  }

  const getStatusText = () => {
    switch (workState.status) {
      case 'starting':
        return 'Starting...'
      case 'thinking':
        return 'Analyzing...'
      case 'working':
        return 'Working...'
      case 'complete':
        return 'Completed'
      case 'error':
        return 'Failed'
      case 'cancelled':
        return 'Cancelled'
    }
  }

  const getStatusColor = () => {
    switch (workState.status) {
      case 'starting':
      case 'thinking':
      case 'working':
        return 'text-violet-400'
      case 'complete':
        return 'text-emerald-400'
      case 'error':
      case 'cancelled':
        return 'text-red-400'
    }
  }

  // Call callbacks on completion/error
  if (workState.isComplete) {
    if (workState.status === 'complete' && onComplete) {
      setTimeout(onComplete, 1000)
      onComplete = undefined // Prevent multiple calls
    } else if (
      (workState.status === 'error' || workState.status === 'cancelled') &&
      onError
    ) {
      setTimeout(onError, 1000)
      onError = undefined // Prevent multiple calls
    }
  }

  const handleDismiss = useCallback(() => {
    onDismiss?.()
  }, [onDismiss])

  const handleClick = useCallback(() => {
    onClick?.()
  }, [onClick])

  return (
    <div
      className={`group bg-slate-900/90 backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden shadow-xl transition-all duration-200 ${
        onClick ? 'cursor-pointer hover:border-white/20 hover:shadow-lg' : ''
      }`}
      onClick={handleClick}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 bg-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={getStatusColor()}>{getStatusIcon()}</div>
            <div>
              <h3
                className="text-sm font-medium text-white"
                style={{ fontFamily: 'Outfit, sans-serif' }}
              >
                {issueTitle}
              </h3>
              <p className="text-xs text-slate-400 flex items-center gap-2">
                <span>Agent is {getStatusText().toLowerCase()}</span>
                {startedAt && !workState.isComplete && (
                  <>
                    <span className="text-slate-600">•</span>
                    <span className="font-mono text-slate-500">
                      {elapsed}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {workState.isComplete && onDismiss && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDismiss()
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-500/10 border border-slate-500/20 text-xs font-medium text-slate-400 hover:bg-slate-500/20 hover:border-slate-500/30 transition-all duration-200"
                title="Dismiss"
              >
                Dismiss
              </button>
            )}
            {!workState.isComplete && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleCancel()
                }}
                className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs font-medium text-red-400 hover:bg-red-500/20 hover:border-red-500/30 transition-all duration-200"
              >
                Cancel
              </button>
            )}
            <div
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${
                workState.isConnected
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-amber-500/10 text-amber-400'
              }`}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  workState.isConnected
                    ? 'bg-emerald-400 animate-pulse'
                    : 'bg-amber-400'
                }`}
              />
              <span className="text-xs">
                {workState.isConnected ? 'Live' : 'Reconnecting...'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-400">
            {workState.currentStep}
          </span>
          <span className="text-xs text-slate-400 font-mono">
            {workState.progress}%
          </span>
        </div>
        <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all duration-300 ease-out ${
              workState.status === 'error' || workState.status === 'cancelled'
                ? 'bg-gradient-to-r from-red-500 to-red-600'
                : workState.status === 'complete'
                  ? 'bg-gradient-to-r from-emerald-500 to-emerald-600'
                  : 'bg-gradient-to-r from-violet-500 to-purple-600'
            }`}
            style={{ width: `${workState.progress}%` }}
          />
        </div>
      </div>

      {/* Error Message */}
      {workState.error && (
        <div className="px-4 py-3 bg-red-500/10 border-t border-red-500/20">
          <p className="text-sm text-red-400">{workState.error.message}</p>
          {workState.error.canRetry && (
            <button
              onClick={() => window.location.reload()}
              className="mt-2 px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-xs font-medium text-red-400 hover:bg-red-500/30 transition-all"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Result Summary */}
      {workState.result && (
        <div className="px-4 py-3 bg-emerald-500/10 border-t border-emerald-500/20">
          <p className="text-sm text-emerald-400 font-medium mb-2">
            Work Complete
          </p>
          <p className="text-xs text-slate-300 leading-relaxed">
            {workState.result.summary}
          </p>
          {workState.result.filesChanged &&
            workState.result.filesChanged.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-slate-400 mb-1">Files changed:</p>
                <div className="flex flex-wrap gap-1">
                  {workState.result.filesChanged.map((file) => (
                    <code
                      key={file}
                      className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-xs text-emerald-400 font-mono"
                    >
                      {file}
                    </code>
                  ))}
                </div>
              </div>
            )}
        </div>
      )}

      {/* Recent Events (Terminal-like output) */}
      {workState.isActive && workState.events.length > 0 && (
        <div className="px-4 py-3 border-t border-white/5 bg-slate-950/50">
          <p className="text-xs text-slate-500 mb-2 font-mono">
            Recent activity:
          </p>
          <div className="space-y-1 max-h-32 overflow-y-auto font-mono text-xs">
            {workState.events
              .slice(-10)
              .reverse()
              .map((event, i) => (
                <div key={i} className="flex items-start gap-2 text-slate-400">
                  <span className="text-slate-600 flex-shrink-0">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="flex-1">
                    {event.type === 'step' && (
                      <>
                        <span className="text-violet-400">
                          {event.data.stepType === 'tool_call' && '🔧'}
                          {event.data.stepType === 'file_read' && '📖'}
                          {event.data.stepType === 'file_write' && '✏️'}
                          {event.data.stepType === 'shell_command' && '💻'}
                        </span>
                        <span className="ml-1">{event.data.content}</span>
                      </>
                    )}
                    {event.type === 'status' && (
                      <span className="text-blue-400">
                        {event.data.message}
                      </span>
                    )}
                    {event.type === 'progress' && (
                      <span className="text-slate-500">
                        {event.data.currentStep}
                      </span>
                    )}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
