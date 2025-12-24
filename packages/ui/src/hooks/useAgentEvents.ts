/**
 * React hook for connecting to the SSE endpoint and receiving agent work progress
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import type { AgentEvent } from '../lib/api/types'

export interface AgentWorkState {
  status: 'starting' | 'thinking' | 'working' | 'complete' | 'error' | 'cancelled'
  progress: number
  currentStep: string
  totalSteps?: number
  events: AgentEvent[]
  isComplete: boolean
  isConnected: boolean
  isActive: boolean
  error?: {
    message: string
    recoverable: boolean
    canRetry: boolean
  }
  result?: {
    success: boolean
    summary: string
    filesChanged: string[]
    duration: number
  }
}

const initialState: AgentWorkState = {
  status: 'starting',
  progress: 0,
  currentStep: 'Initializing...',
  events: [],
  isComplete: false,
  isConnected: false,
  isActive: false,
}

const MAX_RETRY_ATTEMPTS = 5
const RETRY_DELAYS = [1000, 2000, 5000, 10000, 30000] // Exponential backoff

export function useAgentEvents(issueId: string, enabled: boolean = true) {
  const [state, setState] = useState<AgentWorkState>(initialState)
  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const retryCountRef = useRef(0)
  const lastEventTimeRef = useRef(Date.now())

  const connect = useCallback(() => {
    if (!enabled || !issueId) return

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }

    // If we've exceeded max retries, give up
    if (retryCountRef.current >= MAX_RETRY_ATTEMPTS) {
      console.error('[useAgentEvents] Max retry attempts reached')
      setConnectionError('Connection failed after multiple attempts. Please refresh to try again.')
      return
    }

    // Build URL - use the backend server URL
    const backendUrl = process.env.BD_API_URL || 'http://localhost:3001'
    const url = new URL(`${backendUrl}/api/work/events`)
    url.searchParams.set('issue_id', issueId)

    const retryNum = retryCountRef.current
    console.log(`[useAgentEvents] Connecting (attempt ${retryNum + 1}/${MAX_RETRY_ATTEMPTS}) to ${url.toString()}`)

    const eventSource = new EventSource(url.toString())
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      console.log('[useAgentEvents] Connected')
      setIsConnected(true)
      setConnectionError(null)
      retryCountRef.current = 0 // Reset retry count on successful connection
      lastEventTimeRef.current = Date.now()
      setState(prev => ({ ...prev, isConnected: true, isActive: true }))
    }

    eventSource.onmessage = (event) => {
      try {
        lastEventTimeRef.current = Date.now()
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

          // Update computed properties
          newState.isComplete = newState.status === 'complete' || newState.status === 'error' || newState.status === 'cancelled'
          newState.isActive = !newState.isComplete && newState.status !== 'cancelled'

          return newState
        })
      } catch (err) {
        console.error('[useAgentEvents] Failed to parse event:', err)
      }
    }

    eventSource.onerror = (error) => {
      console.error('[useAgentEvents] Connection error:', error)
      setIsConnected(false)
      setState(prev => ({ ...prev, isConnected: false }))

      // Check if work is actually complete (we might have missed the final event)
      const workIsComplete = state.status === 'complete' || state.status === 'error' || state.status === 'cancelled'

      if (workIsComplete) {
        console.log('[useAgentEvents] Work is complete, not reconnecting')
        setConnectionError(null)
        // Don't reconnect if work is done
        if (eventSourceRef.current) {
          eventSourceRef.current.close()
          eventSourceRef.current = null
        }
        return
      }

      // Schedule reconnection with exponential backoff
      const delay = RETRY_DELAYS[Math.min(retryCountRef.current, RETRY_DELAYS.length - 1)]

      if (retryCountRef.current < MAX_RETRY_ATTEMPTS) {
        retryCountRef.current++
        setConnectionError(`Connection lost. Reconnecting in ${delay / 1000}s... (attempt ${retryCountRef.current}/${MAX_RETRY_ATTEMPTS})`)

        retryTimeoutRef.current = setTimeout(() => {
          connect()
        }, delay)
      } else {
        setConnectionError('Connection failed after multiple attempts. The work may have completed - check the issue status.')
      }
    }
  }, [issueId, enabled, state.status])

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      console.log('[useAgentEvents] Disconnecting')
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }
    setIsConnected(false)
  }, [])

  // Reset state when issueId changes
  useEffect(() => {
    setState(initialState)
    setConnectionError(null)
    retryCountRef.current = 0
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
    retryCountRef.current = 0
    disconnect()
    // Small delay before reconnecting
    setTimeout(() => {
      connect()
    }, 100)
  }, [connect, disconnect])

  // Monitor for stale connections (no events for 2 minutes)
  useEffect(() => {
    if (!isConnected || state.isComplete) return

    const checkInterval = setInterval(() => {
      const timeSinceLastEvent = Date.now() - lastEventTimeRef.current
      if (timeSinceLastEvent > 2 * 60 * 1000) {
        console.warn('[useAgentEvents] No events for 2 minutes, reconnecting...')
        reconnect()
      }
    }, 30000) // Check every 30 seconds

    return () => clearInterval(checkInterval)
  }, [isConnected, reconnect, state.isComplete])

  return {
    ...state,
    isConnected,
    connectionError,
    reconnect,
    isComplete: state.status === 'complete' || state.status === 'error' || state.status === 'cancelled',
    isActive: ['starting', 'thinking', 'working'].includes(state.status),
  }
}
