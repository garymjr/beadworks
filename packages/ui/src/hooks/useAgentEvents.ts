/**
 * React hook for connecting to the SSE endpoint and receiving agent work progress
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentEvent } from '../lib/api/types'

export interface AgentWorkState {
  status:
    | 'starting'
    | 'thinking'
    | 'working'
    | 'complete'
    | 'error'
    | 'cancelled'
  progress: number
  currentStep: string
  totalSteps?: number
  events: Array<AgentEvent>
  error?: {
    message: string
    recoverable: boolean
    canRetry: boolean
  }
  result?: {
    success: boolean
    summary: string
    filesChanged: Array<string>
    duration: number
  }
}

const initialState: AgentWorkState = {
  status: 'starting',
  progress: 0,
  currentStep: 'Initializing...',
  events: [],
}

export function useAgentEvents(issueId: string, enabled: boolean = true) {
  const [state, setState] = useState<AgentWorkState>(initialState)
  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const connect = useCallback(() => {
    if (!enabled || !issueId) return

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
    }

    // Build URL - use the backend server URL
    const backendUrl = process.env.BD_API_URL || 'http://localhost:3001'
    const url = new URL(`${backendUrl}/api/work/events`)
    url.searchParams.set('issue_id', issueId)

    console.log(`[useAgentEvents] Connecting to ${url.toString()}`)

    const eventSource = new EventSource(url.toString())
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      console.log('[useAgentEvents] Connected')
      setIsConnected(true)
      setConnectionError(null)
    }

    eventSource.onmessage = (event) => {
      try {
        const data: AgentEvent = JSON.parse(event.data)

        console.log('[useAgentEvents] Received event:', data.type)

        setState((prevState) => {
          const newState = { ...prevState }

          switch (data.type) {
            case 'status':
              newState.status = data.data.status
              newState.currentStep = data.data.message || newState.currentStep
              break
            case 'progress':
              newState.progress = data.data.percent
              newState.currentStep = data.data.currentStep
              newState.totalSteps = data.data.totalSteps
              break
            case 'step':
              // Don't change state, just add to events
              break
            case 'error':
              newState.status = 'error'
              newState.error = data.data
              break
            case 'complete':
              newState.status = data.data.success ? 'complete' : 'error'
              newState.progress = 100
              newState.result = data.data
              newState.currentStep = data.data.success ? 'Completed' : 'Failed'
              break
          }

          // Add event to history
          newState.events = [...prevState.events, data]

          return newState
        })
      } catch (err) {
        console.error('[useAgentEvents] Failed to parse event:', err)
      }
    }

    eventSource.onerror = (error) => {
      console.error('[useAgentEvents] Connection error:', error)
      setIsConnected(false)
      setConnectionError('Connection lost. Reconnecting...')

      // EventSource will automatically attempt to reconnect
      // We just need to handle UI state
    }
  }, [issueId, enabled])

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      console.log('[useAgentEvents] Disconnecting')
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
    }
    setIsConnected(false)
  }, [])

  // Reset state when issueId changes
  useEffect(() => {
    setState(initialState)
    setConnectionError(null)
  }, [issueId])

  // Connect/disconnect based on enabled state
  useEffect(() => {
    if (enabled) {
      connect()
    } else {
      disconnect()
    }

    return () => {
      disconnect()
    }
  }, [enabled, connect, disconnect])

  // Manual reconnect function
  const reconnect = useCallback(() => {
    disconnect()
    // Small delay before reconnecting
    setTimeout(() => {
      connect()
    }, 100)
  }, [connect, disconnect])

  return {
    ...state,
    isConnected,
    connectionError,
    reconnect,
    isComplete:
      state.status === 'complete' ||
      state.status === 'error' ||
      state.status === 'cancelled',
    isActive: ['starting', 'thinking', 'working'].includes(state.status),
  }
}
