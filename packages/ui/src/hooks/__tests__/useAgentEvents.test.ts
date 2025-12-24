/**
 * Tests for useAgentEvents hook
 * Tests the lifecycle of agent work state tracking including:
 * - Connection establishment
 * - Event processing (status, progress, step, error, complete)
 * - Reconnection with exponential backoff
 * - State transitions
 * - Error handling
 */

import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAgentEvents } from '../useAgentEvents'

// Mock EventSource
class MockEventSource {
  public url: string
  public readyState: number = 0 // CONNECTING
  public onopen: ((event: Event) => void) | null = null
  public onmessage: ((event: MessageEvent) => void) | null = null
  public onerror: ((event: Event) => void) | null = null

  private eventListeners: Map<string, Set<(event: any) => void>> = new Map()

  constructor(url: string) {
    this.url = url
    // Simulate successful connection after a delay
    setTimeout(() => {
      this.readyState = 1 // OPEN
      if (this.onopen) {
        this.onopen(new Event('open'))
      }
    }, 10)
  }

  addEventListener(type: string, listener: (event: any) => void) {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set())
    }
    this.eventListeners.get(type)!.add(listener)
  }

  removeEventListener(type: string, listener: (event: any) => void) {
    const listeners = this.eventListeners.get(type)
    if (listeners) {
      listeners.delete(listener)
    }
  }

  dispatchEvent(event: Event): boolean {
    const listeners = this.eventListeners.get(event.type)
    if (listeners) {
      listeners.forEach((listener) => listener(event))
      return true
    }
    return false
  }

  close() {
    this.readyState = 2 // CLOSED
  }

  // Helper method to simulate receiving a message
  simulateMessage(data: any) {
    if (this.onmessage) {
      const event = new MessageEvent('message', { data: JSON.stringify(data) })
      this.onmessage(event)
    }
  }

  // Helper method to simulate an error
  simulateError() {
    this.readyState = 2 // CLOSED
    if (this.onerror) {
      this.onerror(new Event('error'))
    }
  }
}

// Store the mock instances to access them in tests
const mockEventSources: Map<string, MockEventSource> = new Map()

vi.stubGlobal('EventSource', vi.fn().mockImplementation((url: string) => {
  const mock = new MockEventSource(url)
  mockEventSources.set(url, mock)
  return mock as any
}))

describe('useAgentEvents', () => {
  let mockEnv: any

  beforeEach(() => {
    mockEnv = process.env
    process.env.BD_API_URL = 'http://localhost:3001'
    mockEventSources.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    process.env = mockEnv
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe('Initial state', () => {
    it('should return initial state when disabled', () => {
      const { result } = renderHook(() =>
        useAgentEvents('test-issue-1', false),
      )

      expect(result.current.status).toBe('starting')
      expect(result.current.progress).toBe(0)
      expect(result.current.currentStep).toBe('Initializing...')
      expect(result.current.isConnected).toBe(false)
      expect(result.current.isActive).toBe(false)
      expect(result.current.isComplete).toBe(false)
      expect(result.current.events).toEqual([])
    })

    it('should connect when enabled', async () => {
      const { result } = renderHook(() => useAgentEvents('test-issue-1'))

      // Initially connecting
      expect(result.current.status).toBe('starting')
      expect(result.current.isConnected).toBe(false)

      // Wait for connection
      await waitFor(() => {
        expect(result.current.isConnected).toBe(true)
      })
    })
  })

  describe('Connection lifecycle', () => {
    it('should establish connection and update state', async () => {
      const { result } = renderHook(() => useAgentEvents('test-issue-1'))

      // Wait for connection
      await waitFor(
        () => {
          expect(result.current.isConnected).toBe(true)
          expect(result.current.isActive).toBe(true)
        },
        { timeout: 100 },
      )

      const esCalls = (EventSource as any).mock.calls
      expect(esCalls.length).toBeGreaterThan(0)
      const url = esCalls[0][0]
      expect(url).toContain('test-issue-1')
    })

    it('should handle connection errors with retry', async () => {
      const { result } = renderHook(() => useAgentEvents('test-issue-1'))

      // Get the EventSource instance
      const esCalls = (EventSource as any).mock.calls
      const mock = mockEventSources.get(esCalls[0][0])

      await waitFor(
        () => {
          expect(result.current.isConnected).toBe(true)
        },
        { timeout: 100 },
      )

      // Simulate connection error
      act(() => {
        mock?.simulateError()
      })

      // Should show connection error
      await waitFor(() => {
        expect(result.current.isConnected).toBe(false)
        expect(result.current.connectionError).toBeTruthy()
      })

      // Should attempt reconnection
      await waitFor(
        () => {
          expect((EventSource as any).mock.calls.length).toBeGreaterThan(1)
        },
        { timeout: 3000 },
      )
    })

    it('should not reconnect when work is complete', async () => {
      const { result } = renderHook(() => useAgentEvents('test-issue-1'))

      const esCalls = (EventSource as any).mock.calls
      const mock = mockEventSources.get(esCalls[0][0])

      // Wait for connection
      await waitFor(
        () => {
          expect(result.current.isConnected).toBe(true)
        },
        { timeout: 100 },
      )

      // Send complete event
      act(() => {
        mock?.simulateMessage({
          type: 'complete',
          data: {
            success: true,
            summary: 'Work completed successfully',
            filesChanged: [],
            duration: 5000,
          },
        })
      })

      await waitFor(() => {
        expect(result.current.status).toBe('complete')
      })

      const initialCallCount = (EventSource as any).mock.calls.length

      // Simulate error after completion
      act(() => {
        mock?.simulateError()
      })

      // Should NOT reconnect (call count should not increase)
      await waitFor(
        () => {
          expect((EventSource as any).mock.calls.length).toBe(initialCallCount)
        },
        { timeout: 2000 },
      )
    })
  })

  describe('Event processing', () => {
    it('should process status events', async () => {
      const { result } = renderHook(() => useAgentEvents('test-issue-1'))

      const esCalls = (EventSource as any).mock.calls
      const mock = mockEventSources.get(esCalls[0][0])

      await waitFor(
        () => {
          expect(result.current.isConnected).toBe(true)
        },
        { timeout: 100 },
      )

      act(() => {
        mock?.simulateMessage({
          type: 'status',
          data: {
            status: 'thinking',
            message: 'Analyzing the problem...',
          },
        })
      })

      expect(result.current.status).toBe('thinking')
      expect(result.current.currentStep).toBe('Analyzing the problem...')
    })

    it('should process progress events', async () => {
      const { result } = renderHook(() => useAgentEvents('test-issue-1'))

      const esCalls = (EventSource as any).mock.calls
      const mock = mockEventSources.get(esCalls[0][0])

      await waitFor(
        () => {
          expect(result.current.isConnected).toBe(true)
        },
        { timeout: 100 },
      )

      act(() => {
        mock?.simulateMessage({
          type: 'progress',
          data: {
            percent: 45,
            currentStep: 'Writing code',
            totalSteps: 10,
          },
        })
      })

      expect(result.current.progress).toBe(45)
      expect(result.current.currentStep).toBe('Writing code')
      expect(result.current.totalSteps).toBe(10)
    })

    it('should process step events', async () => {
      const { result } = renderHook(() => useAgentEvents('test-issue-1'))

      const esCalls = (EventSource as any).mock.calls
      const mock = mockEventSources.get(esCalls[0][0])

      await waitFor(
        () => {
          expect(result.current.isConnected).toBe(true)
        },
        { timeout: 100 },
      )

      const eventCountBefore = result.current.events.length

      act(() => {
        mock?.simulateMessage({
          type: 'step',
          data: {
            stepType: 'tool_call',
            content: 'Reading file src/test.ts',
          },
        })
      })

      expect(result.current.events.length).toBe(eventCountBefore + 1)
      expect(result.current.events[eventCountBefore]).toEqual({
        type: 'step',
        data: {
          stepType: 'tool_call',
          content: 'Reading file src/test.ts',
        },
      })
    })

    it('should process error events', async () => {
      const { result } = renderHook(() => useAgentEvents('test-issue-1'))

      const esCalls = (EventSource as any).mock.calls
      const mock = mockEventSources.get(esCalls[0][0])

      await waitFor(
        () => {
          expect(result.current.isConnected).toBe(true)
        },
        { timeout: 100 },
      )

      act(() => {
        mock?.simulateMessage({
          type: 'error',
          data: {
            message: 'Failed to read file',
            recoverable: true,
            canRetry: true,
          },
        })
      })

      expect(result.current.status).toBe('error')
      expect(result.current.error).toEqual({
        message: 'Failed to read file',
        recoverable: true,
        canRetry: true,
      })
      expect(result.current.isComplete).toBe(true)
    })

    it('should process complete events (success)', async () => {
      const { result } = renderHook(() => useAgentEvents('test-issue-1'))

      const esCalls = (EventSource as any).mock.calls
      const mock = mockEventSources.get(esCalls[0][0])

      await waitFor(
        () => {
          expect(result.current.isConnected).toBe(true)
        },
        { timeout: 100 },
      )

      act(() => {
        mock?.simulateMessage({
          type: 'complete',
          data: {
            success: true,
            summary: 'Successfully implemented feature',
            filesChanged: ['src/test.ts', 'src/test.test.ts'],
            duration: 12000,
          },
        })
      })

      expect(result.current.status).toBe('complete')
      expect(result.current.progress).toBe(100)
      expect(result.current.result).toEqual({
        success: true,
        summary: 'Successfully implemented feature',
        filesChanged: ['src/test.ts', 'src/test.test.ts'],
        duration: 12000,
      })
      expect(result.current.isComplete).toBe(true)
    })

    it('should process complete events (failure)', async () => {
      const { result } = renderHook(() => useAgentEvents('test-issue-1'))

      const esCalls = (EventSource as any).mock.calls
      const mock = mockEventSources.get(esCalls[0][0])

      await waitFor(
        () => {
          expect(result.current.isConnected).toBe(true)
        },
        { timeout: 100 },
      )

      act(() => {
        mock?.simulateMessage({
          type: 'complete',
          data: {
            success: false,
            summary: 'Implementation failed',
            filesChanged: [],
            duration: 5000,
          },
        })
      })

      expect(result.current.status).toBe('error')
      expect(result.current.isComplete).toBe(true)
    })
  })

  describe('State transitions', () => {
    it('should transition through lifecycle states', async () => {
      const { result } = renderHook(() => useAgentEvents('test-issue-1'))

      const esCalls = (EventSource as any).mock.calls
      const mock = mockEventSources.get(esCalls[0][0])

      await waitFor(
        () => {
          expect(result.current.isConnected).toBe(true)
        },
        { timeout: 100 },
      )

      // starting -> thinking
      act(() => {
        mock?.simulateMessage({
          type: 'status',
          data: { status: 'thinking', message: 'Planning...' },
        })
      })
      expect(result.current.status).toBe('thinking')
      expect(result.current.isActive).toBe(true)

      // thinking -> working
      act(() => {
        mock?.simulateMessage({
          type: 'status',
          data: { status: 'working', message: 'Implementing...' },
        })
      })
      expect(result.current.status).toBe('working')
      expect(result.current.isActive).toBe(true)

      // working -> complete
      act(() => {
        mock?.simulateMessage({
          type: 'complete',
          data: {
            success: true,
            summary: 'Done',
            filesChanged: [],
            duration: 1000,
          },
        })
      })
      expect(result.current.status).toBe('complete')
      expect(result.current.isActive).toBe(false)
      expect(result.current.isComplete).toBe(true)
    })
  })

  describe('Multiple concurrent agents', () => {
    it('should handle multiple hooks with different issue IDs independently', async () => {
      const { result: result1 } = renderHook(() =>
        useAgentEvents('issue-1'),
      )
      const { result: result2 } = renderHook(() =>
        useAgentEvents('issue-2'),
      )

      const esCalls = (EventSource as any).mock.calls
      const mock1 = mockEventSources.get(esCalls[0][0])
      const mock2 = mockEventSources.get(esCalls[1][0])

      await waitFor(
        () => {
          expect(result1.current.isConnected).toBe(true)
          expect(result2.current.isConnected).toBe(true)
        },
        { timeout: 100 },
      )

      // Update first issue
      act(() => {
        mock1?.simulateMessage({
          type: 'status',
          data: { status: 'working', message: 'Issue 1 working' },
        })
      })

      // Update second issue differently
      act(() => {
        mock2?.simulateMessage({
          type: 'status',
          data: { status: 'thinking', message: 'Issue 2 thinking' },
        })
      })

      expect(result1.current.status).toBe('working')
      expect(result1.current.currentStep).toBe('Issue 1 working')

      expect(result2.current.status).toBe('thinking')
      expect(result2.current.currentStep).toBe('Issue 2 thinking')
    })
  })

  describe('Cleanup and reconnection', () => {
    it('should cleanup on unmount', () => {
      const { unmount } = renderHook(() => useAgentEvents('test-issue-1'))

      const esCalls = (EventSource as any).mock.calls
      const mock = mockEventSources.get(esCalls[0][0])

      unmount()

      expect(mock?.readyState).toBe(2) // CLOSED
    })

    it('should reset state when issueId changes', async () => {
      const { result, rerender } = renderHook(
        ({ issueId }) => useAgentEvents(issueId),
        { initialProps: { issueId: 'issue-1' } },
      )

      const esCalls1 = (EventSource as any).mock.calls
      const mock1 = mockEventSources.get(esCalls1[0][0])

      await waitFor(
        () => {
          expect(result.current.isConnected).toBe(true)
        },
        { timeout: 100 },
      )

      // Add some progress
      act(() => {
        mock1?.simulateMessage({
          type: 'progress',
          data: { percent: 50, currentStep: 'Working' },
        })
      })

      expect(result.current.progress).toBe(50)

      // Change issue ID
      rerender({ issueId: 'issue-2' })

      // State should be reset
      expect(result.current.progress).toBe(0)
      expect(result.current.status).toBe('starting')
      expect(result.current.events).toEqual([])

      // New connection should be made
      await waitFor(
        () => {
          expect((EventSource as any).mock.calls.length).toBe(2)
        },
        { timeout: 100 },
      )
    })

    it('should provide reconnect function', async () => {
      const { result } = renderHook(() => useAgentEvents('test-issue-1'))

      const esCalls = (EventSource as any).mock.calls
      const mock = mockEventSources.get(esCalls[0][0])

      await waitFor(
        () => {
          expect(result.current.isConnected).toBe(true)
        },
        { timeout: 100 },
      )

      const initialCallCount = (EventSource as any).mock.calls.length

      // Call reconnect
      act(() => {
        result.current.reconnect()
      })

      // Should close existing connection and create new one
      await waitFor(
        () => {
          expect((EventSource as any).mock.calls.length).toBeGreaterThan(
            initialCallCount,
          )
        },
        { timeout: 100 },
      )
    })
  })

  describe('Max retry attempts', () => {
    it('should stop retrying after max attempts', async () => {
      const { result } = renderHook(() => useAgentEvents('test-issue-1'))

      const esCalls = (EventSource as any).mock.calls
      const mock = mockEventSources.get(esCalls[0][0])

      await waitFor(
        () => {
          expect(result.current.isConnected).toBe(true)
        },
        { timeout: 100 },
      )

      // Simulate multiple connection errors
      for (let i = 0; i < 6; i++) {
        act(() => {
          mock?.simulateError()
        })
        // Advance timers to trigger reconnection attempts
        act(() => {
          vi.advanceTimersByTime(10000)
        })
      }

      await waitFor(() => {
        expect(result.current.connectionError).toContain('Max retry attempts')
      })
    })
  })
})
