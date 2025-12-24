/**
 * WorkProgressModal - Detailed view of agent work session
 * Shows full event history with filtering, search, and stats
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AgentEvent, AgentWorkState } from '../hooks/useAgentEvents'

interface WorkProgressModalProps {
  isOpen: boolean
  onClose: () => void
  issueId: string
  issueTitle: string
  workState: AgentWorkState
  startedAt?: number
}

type EventFilter = 'all' | 'tool_call' | 'file_read' | 'file_write' | 'shell_command' | 'status' | 'progress'

export function WorkProgressModal({
  isOpen,
  onClose,
  issueId,
  issueTitle,
  workState,
  startedAt,
}: WorkProgressModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<EventFilter>('all')
  const [selectedEvent, setSelectedEvent] = useState<AgentEvent | null>(null)

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  // Calculate session stats
  const sessionStats = useMemo(() => {
    const steps = workState.events.filter((e) => e.type === 'step')
    const toolCalls = steps.filter(
      (e) => e.type === 'step' && e.data.stepType === 'tool_call'
    ).length
    const fileReads = steps.filter(
      (e) => e.type === 'step' && e.data.stepType === 'file_read'
    ).length
    const fileWrites = steps.filter(
      (e) => e.type === 'step' && e.data.stepType === 'file_write'
    ).length
    const shellCommands = steps.filter(
      (e) => e.type === 'step' && e.data.stepType === 'shell_command'
    ).length
    const duration = startedAt ? Date.now() - startedAt : 0
    const durationSec = Math.floor(duration / 1000)

    return {
      totalSteps: steps.length,
      toolCalls,
      fileReads,
      fileWrites,
      shellCommands,
      duration: durationSec,
    }
  }, [workState.events, startedAt])

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
  }

  // Filter events
  const filteredEvents = useMemo(() => {
    return workState.events.filter((event) => {
      // Apply type filter
      if (filter !== 'all') {
        if (filter === 'status' && event.type !== 'status') return false
        if (filter === 'progress' && event.type !== 'progress') return false
        if (
          ['tool_call', 'file_read', 'file_write', 'shell_command'].includes(
            filter
          )
        ) {
          if (event.type !== 'step') return false
          if (event.data.stepType !== filter) return false
        }
      }

      // Apply search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const content = event.data.content?.toLowerCase() || ''
        const toolName = event.data.toolName?.toLowerCase() || ''
        const filePath = event.data.filePath?.toLowerCase() || ''
        if (!content && !toolName && !filePath) return false
        if (
          !content.includes(query) &&
          !toolName.includes(query) &&
          !filePath.includes(query)
        ) {
          return false
        }
      }

      return true
    })
  }, [workState.events, filter, searchQuery])

  // Get event icon
  const getEventIcon = (event: AgentEvent) => {
    if (event.type === 'status') {
      return (
        <span className="text-blue-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </span>
      )
    }
    if (event.type === 'progress') {
      return (
        <span className="text-slate-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </span>
      )
    }
    if (event.type === 'step') {
      switch (event.data.stepType) {
        case 'tool_call':
          return <span className="text-violet-400">🔧</span>
        case 'file_read':
          return <span className="text-emerald-400">📖</span>
        case 'file_write':
          return <span className="text-amber-400">✏️</span>
        case 'shell_command':
          return <span className="text-red-400">💻</span>
        default:
          return <span className="text-slate-400">•</span>
      }
    }
    return <span className="text-slate-400">•</span>
  }

  // Get event type label
  const getEventLabel = (event: AgentEvent) => {
    if (event.type === 'status') return 'Status'
    if (event.type === 'progress') return 'Progress'
    if (event.type === 'step') {
      switch (event.data.stepType) {
        case 'tool_call':
          return `Tool: ${event.data.toolName || 'unknown'}`
        case 'file_read':
          return `Read: ${event.data.filePath || 'unknown'}`
        case 'file_write':
          return `Write: ${event.data.filePath || 'unknown'}`
        case 'shell_command':
          return 'Shell Command'
        default:
          return 'Step'
      }
    }
    return event.type
  }

  // Copy to clipboard
  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
  }, [])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-6xl max-h-[90vh] bg-slate-900/95 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
            </div>
            <div>
              <h2
                className="text-lg font-semibold text-white"
                style={{ fontFamily: 'Outfit, sans-serif' }}
              >
                {issueTitle}
              </h2>
              <p className="text-sm text-slate-400 font-mono">
                {issueId}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Stats Bar */}
        <div className="flex items-center gap-6 px-6 py-3 border-b border-white/5 bg-slate-950/50">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Duration:</span>
            <span className="text-white font-mono">{formatDuration(sessionStats.duration)}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Steps:</span>
            <span className="text-white font-mono">{sessionStats.totalSteps}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Tools:</span>
            <span className="text-violet-400 font-mono">{sessionStats.toolCalls}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Files:</span>
            <span className="text-emerald-400 font-mono">{sessionStats.fileReads}R</span>
            <span className="text-amber-400 font-mono">{sessionStats.fileWrites}W</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Commands:</span>
            <span className="text-red-400 font-mono">{sessionStats.shellCommands}</span>
          </div>
          <div className="flex items-center gap-2 text-sm ml-auto">
            <span className="text-slate-500">Status:</span>
            <span
              className={`font-medium ${
                workState.status === 'complete'
                  ? 'text-emerald-400'
                  : workState.status === 'error'
                    ? 'text-red-400'
                    : 'text-violet-400'
              }`}
            >
              {workState.status}
            </span>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="flex items-center gap-4 px-6 py-3 border-b border-white/5 bg-slate-950/30">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === 'all'
                  ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('tool_call')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === 'tool_call'
                  ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
            >
              Tools
            </button>
            <button
              onClick={() => setFilter('file_read')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === 'file_read'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
            >
              Reads
            </button>
            <button
              onClick={() => setFilter('file_write')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === 'file_write'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
            >
              Writes
            </button>
            <button
              onClick={() => setFilter('shell_command')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === 'shell_command'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
            >
              Commands
            </button>
          </div>
          <div className="relative flex-1 max-w-md">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search events..."
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/50"
            />
          </div>
        </div>

        {/* Content - Split Pane */}
        <div className="flex-1 flex overflow-hidden">
          {/* Event List */}
          <div className="w-1/2 border-r border-white/5 overflow-y-auto">
            <div className="p-4 space-y-2">
              {filteredEvents.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-slate-500 text-sm">No events found</p>
                </div>
              ) : (
                filteredEvents.map((event, index) => (
                  <div
                    key={index}
                    onClick={() => setSelectedEvent(event)}
                    className={`p-3 rounded-lg cursor-pointer transition-all ${
                      selectedEvent === event
                        ? 'bg-violet-500/10 border border-violet-500/30'
                        : 'bg-white/5 hover:bg-white/10 border border-transparent'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">{getEventIcon(event)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-slate-300 truncate">
                            {getEventLabel(event)}
                          </p>
                          <span className="text-xs text-slate-600 font-mono flex-shrink-0">
                            {new Date(event.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        {event.data.content && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                            {event.data.content}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Event Details */}
          <div className="w-1/2 overflow-y-auto">
            <div className="p-6">
              {selectedEvent ? (
                <div className="space-y-6">
                  {/* Event Header */}
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="text-2xl">{getEventIcon(selectedEvent)}</div>
                      <div>
                        <h3 className="text-lg font-semibold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
                          {getEventLabel(selectedEvent)}
                        </h3>
                        <p className="text-sm text-slate-500 font-mono">
                          {new Date(selectedEvent.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Event Data */}
                  <div className="space-y-4">
                    {selectedEvent.data.stepType && (
                      <div>
                        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                          Step Type
                        </label>
                        <p className="text-sm text-white font-mono mt-1">
                          {selectedEvent.data.stepType}
                        </p>
                      </div>
                    )}

                    {selectedEvent.data.toolName && (
                      <div>
                        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                          Tool Name
                        </label>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-sm text-white font-mono">
                            {selectedEvent.data.toolName}
                          </p>
                          <button
                            onClick={() => copyToClipboard(selectedEvent.data.toolName || '')}
                            className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-white transition-colors"
                            title="Copy"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}

                    {selectedEvent.data.filePath && (
                      <div>
                        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                          File Path
                        </label>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-sm text-emerald-400 font-mono break-all">
                            {selectedEvent.data.filePath}
                          </p>
                          <button
                            onClick={() => copyToClipboard(selectedEvent.data.filePath || '')}
                            className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-white transition-colors flex-shrink-0"
                            title="Copy"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}

                    {selectedEvent.data.content && (
                      <div>
                        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                          Content
                        </label>
                        <div className="relative mt-1">
                          <pre className="p-3 rounded-lg bg-slate-950 border border-white/10 text-xs text-slate-300 font-mono overflow-x-auto whitespace-pre-wrap">
                            {selectedEvent.data.content}
                          </pre>
                          <button
                            onClick={() => copyToClipboard(selectedEvent.data.content || '')}
                            className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-500 hover:text-white transition-colors"
                            title="Copy content"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                      <svg
                        className="w-8 h-8 text-white/20"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
                        />
                      </svg>
                    </div>
                    <p className="text-slate-500 text-sm">
                      Select an event to view details
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
