/**
 * Work trigger API routes
 * Endpoints for triggering and managing agent work on issues
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { startWorkOnIssue, cancelWork, getWorkStatus, getAllActiveWork } from '../lib/agent-work-manager.js'
import { workStore } from '../lib/work-store.js'
import { getAgentPool } from '../lib/agent-pool.js'

const workRoutes = new Hono()

// ============================================================================
// SSE Endpoint
// ============================================================================

/**
 * GET /api/work/events
 * SSE endpoint for real-time agent work progress
 */
workRoutes.get('/events', async (c) => {
  const issueId = c.req.query('issue_id')

  console.log(`[SSE] New connection for issue: ${issueId}`)

  const encoder = new TextEncoder()

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    start(controller) {
      let isClosed = false
      const cleanupHandlers: Array<() => void> = []

      // Safe enqueue that handles closed streams
      const safeEnqueue = (data: Uint8Array) => {
        if (isClosed) return
        try {
          controller.enqueue(data)
        } catch (err) {
          console.error('[SSE] Error enqueueing data:', err)
          isClosed = true
          cleanup()
        }
      }

      // Send initial connection message
      try {
        const connectEvent = `data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`
        safeEnqueue(encoder.encode(connectEvent))
        console.log(`[SSE] Sent connect event for issue: ${issueId}`)
      } catch (err) {
        console.error('[SSE] Error sending connect event:', err)
      }

      // Send current session state and recent events if exists (for reconnection)
      if (issueId) {
        const session = workStore.getActiveSession(issueId)
        if (session) {
          console.log(`[SSE] Found active session ${session.workId}, replaying recent events`)

          // Send current status
          try {
            const statusEvent = {
              type: 'status',
              issueId: session.issueId,
              workId: session.workId,
              timestamp: Date.now(),
              data: {
                status: session.status,
                message: session.currentStep,
              },
            }
            safeEnqueue(encoder.encode(`data: ${JSON.stringify(statusEvent)}\n\n`))

            // Send current progress
            const progressEvent = {
              type: 'progress',
              issueId: session.issueId,
              workId: session.workId,
              timestamp: Date.now(),
              data: {
                percent: session.progress,
                currentStep: session.currentStep,
                totalSteps: session.totalSteps,
              },
            }
            safeEnqueue(encoder.encode(`data: ${JSON.stringify(progressEvent)}\n\n`))

            // Replay recent events (last 50) - all types (status, progress, step, error, complete)
            const recentEvents = session.events.slice(-50)
            for (const event of recentEvents) {
              const replayEvent = {
                type: event.type, // Use the actual event type
                issueId: session.issueId,
                workId: session.workId,
                timestamp: event.timestamp,
                data: event.data,
              }
              safeEnqueue(encoder.encode(`data: ${JSON.stringify(replayEvent)}\n\n`))
            }

            // Send completion/error state if applicable
            if (session.status === 'complete' && session.result) {
              const completeEvent = {
                type: 'complete',
                issueId: session.issueId,
                workId: session.workId,
                timestamp: Date.now(),
                data: {
                  success: session.result.success,
                  summary: session.result.summary,
                  duration: session.endTime ? session.endTime - session.startTime : 0,
                  filesChanged: session.result.filesChanged,
                },
              }
              safeEnqueue(encoder.encode(`data: ${JSON.stringify(completeEvent)}\n\n`))
            } else if (session.status === 'error' && session.error) {
              const errorEvent = {
                type: 'error',
                issueId: session.issueId,
                workId: session.workId,
                timestamp: Date.now(),
                data: session.error,
              }
              safeEnqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`))
            }

            console.log(`[SSE] Replayed ${recentEvents.length} events for session ${session.workId}`)
          } catch (err) {
            console.error('[SSE] Error sending session history:', err)
          }
        }
      }

      // Subscribe to work store events
      const unsubscribe = workStore.subscribe((event) => {
        if (isClosed) return

        try {
          // Filter by issue_id if provided
          if (issueId && event.issueId !== issueId) return

          const data = `data: ${JSON.stringify(event)}\n\n`
          safeEnqueue(encoder.encode(data))
        } catch (err) {
          console.error('[SSE] Error sending event:', err)
        }
      })

      cleanupHandlers.push(unsubscribe)

      // Send keep-alive comments every 15 seconds to prevent timeout
      const keepAlive = setInterval(() => {
        if (!isClosed) {
          try {
            safeEnqueue(encoder.encode(': keep-alive\n\n'))
          } catch (err) {
            console.error('[SSE] Error sending keep-alive:', err)
          }
        }
      }, 15000)

      cleanupHandlers.push(() => clearInterval(keepAlive))

      // Clean up when client disconnects
      const cleanup = () => {
        if (isClosed) return
        isClosed = true
        console.log(`[SSE] Cleaning up connection for issue: ${issueId}`)
        cleanupHandlers.forEach((handler) => {
          try {
            handler()
          } catch (err) {
            console.error('[SSE] Error in cleanup handler:', err)
          }
        })
        try {
          controller.close()
        } catch (err) {
          // Already closed
        }
      }

      // Listen for client abort
      if (c.req.raw.signal) {
        c.req.raw.signal.addEventListener('abort', () => {
          console.log(`[SSE] Client aborted connection for issue: ${issueId}`)
          cleanup()
        })
      }

      // Also set up timeout cleanup (30 minutes max)
      const timeout = setTimeout(() => {
        console.log(`[SSE] Connection timeout for issue: ${issueId}`)
        cleanup()
      }, 30 * 60 * 1000)

      cleanupHandlers.push(() => clearTimeout(timeout))
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
})

// ============================================================================
// Work Trigger
// ============================================================================

/**
 * POST /api/work/start
 * Start agent work on an issue
 */
const startWorkSchema = z.object({
  issue_id: z.string().min(1, 'Issue ID is required'),
  project_path: z.string().optional(),
  timeout: z.number().optional(),
})

workRoutes.post('/start', zValidator('json', startWorkSchema), async (c) => {
  const { issue_id, project_path, timeout } = c.req.valid('json')
  
  try {
    const result = await startWorkOnIssue(issue_id, {
      projectPath: project_path,
      timeout,
    })
    
    return c.json({
      success: true,
      ...result,
    })
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message,
    }, 400)
  }
})

// ============================================================================
// Work Status
// ============================================================================

/**
 * GET /api/work/status/:issueId
 * Get the status of work on an issue
 * Returns 404 if no active session exists
 */
workRoutes.get('/status/:issueId', async (c) => {
  const issueId = c.req.param('issueId')

  const status = getWorkStatus(issueId)

  if (!status) {
    return c.json({
      error: 'No active work session found for this issue',
    }, 404)
  }

  return c.json(status)
})

/**
 * GET /api/work/session/:workId
 * Get details of a specific work session
 */
workRoutes.get('/session/:workId', async (c) => {
  const workId = c.req.param('workId')
  const session = workStore.getSession(workId)
  
  if (!session) {
    return c.json({
      error: 'Work session not found',
    }, 404)
  }
  
  return c.json(session)
})

/**
 * GET /api/work/active
 * Get all active work sessions
 */
workRoutes.get('/active', async (c) => {
  const activeWork = getAllActiveWork()
  return c.json({
    sessions: activeWork,
    count: activeWork.length,
  })
})

// ============================================================================
// Work Cancellation
// ============================================================================

/**
 * POST /api/work/cancel/:issueId
 * Cancel active work on an issue
 */
workRoutes.post('/cancel/:issueId', async (c) => {
  const issueId = c.req.param('issueId')

  try {
    const result = await cancelWork(issueId)
    return c.json(result)
  } catch (error: any) {
    return c.json({
      error: error.message,
    }, 400)
  }
})

// ============================================================================
// Agent Pool Status
// ============================================================================

/**
 * GET /api/work/pool-status
 * Get the status of the agent pool including planning agent and worker pool metrics
 */
workRoutes.get('/pool-status', async (c) => {
  try {
    const pool = getAgentPool()
    const allAgents = pool.getAllAgents()
    const stats = pool.getStats()

    // Get planning agent info
    const planningAgents = allAgents.filter(a => a.role === 'planning')
    const planningAgent = planningAgents[0] // There should be exactly 1 planning agent

    // Get worker pool info
    const executionAgents = allAgents.filter(a => a.role === 'execution')

    // Determine planning agent status
    let planningStatus: 'active' | 'idle' | 'error' = 'idle'
    let planningCurrentIssueId: string | undefined
    let planningLastActivity = Date.now()

    if (planningAgent) {
      if (planningAgent.busy) {
        planningStatus = 'active'
        planningCurrentIssueId = planningAgent.currentWorkId
      }
      planningLastActivity = planningAgent.assignedAt || Date.now()
    }

    // Build worker info
    const workers = executionAgents.map(agent => ({
      id: agent.id,
      status: agent.busy ? 'active' : 'idle' as const,
      currentIssueId: agent.currentWorkId,
      lastActivity: agent.assignedAt || Date.now(),
    }))

    const activeWorkers = workers.filter(w => w.status === 'active').length

    return c.json({
      planningAgent: {
        status: planningStatus,
        currentIssueId: planningCurrentIssueId,
        lastActivity: planningLastActivity,
      },
      workerPool: {
        totalWorkers: workers.length,
        activeWorkers,
        idleWorkers: workers.length - activeWorkers,
        workers,
      },
    })
  } catch (error: any) {
    console.error('[PoolStatus] Error getting pool status:', error)
    return c.json({
      error: error.message || 'Failed to get pool status',
    }, 500)
  }
})

export { workRoutes }
