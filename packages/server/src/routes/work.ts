/**
 * Work trigger API routes
 * Endpoints for triggering and managing agent work on issues
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { startWorkOnIssue, cancelWork, getWorkStatus, getAllActiveWork } from '../lib/agent-work-manager.js'
import { workStore } from '../lib/work-store.js'

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
  
  // Set headers for SSE
  return new Response(
    new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        
        // Send initial connection message
        const connectEvent = `data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`
        controller.enqueue(encoder.encode(connectEvent))
        
        // Subscribe to events
        const unsubscribe = workStore.subscribe((event) => {
          // Filter by issue_id if provided
          if (issueId && event.issueId !== issueId) return
          
          const data = `data: ${JSON.stringify(event)}\n\n`
          controller.enqueue(encoder.encode(data))
        })
        
        // Send keep-alive comments every 15 seconds
        const keepAlive = setInterval(() => {
          controller.enqueue(encoder.encode(': keep-alive\n\n'))
        }, 15000)
        
        // Clean up on close
        c.req.raw.signal?.addEventListener('abort', () => {
          clearInterval(keepAlive)
          unsubscribe()
          controller.close()
        })
      },
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
      },
    }
  )
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
 */
workRoutes.get('/status/:issueId', async (c) => {
  const issueId = c.req.param('issueId')
  
  try {
    const status = getWorkStatus(issueId)
    return c.json(status)
  } catch (error: any) {
    return c.json({
      error: error.message,
    }, 404)
  }
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

export { workRoutes }
