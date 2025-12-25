/**
 * Planning API routes
 * Endpoints for generating plans using the planning agent
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { generatePlan } from '../lib/agent-planner.js'
import { getAgentPool } from '../lib/agent-pool.js'

const planningRoutes = new Hono()

/**
 * POST /api/planning/generate
 * Generate a plan for an issue
 */
const generatePlanSchema = z.object({
  issue_id: z.string().min(1, 'Issue ID is required'),
  project_path: z.string().optional(),
  timeout: z.number().optional(),
})

planningRoutes.post('/generate', zValidator('json', generatePlanSchema), async (c) => {
  const { issue_id, project_path, timeout } = c.req.valid('json')

  try {
    const result = await generatePlan(issue_id, project_path, timeout)

    return c.json({
      success: result.success,
      ...result,
    })
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message,
    }, 400)
  }
})

/**
 * GET /api/planning/pool/status
 * Get agent pool status
 */
planningRoutes.get('/pool/status', async (c) => {
  const pool = getAgentPool()

  const stats = pool.getStats()
  const agents = pool.getAllAgents().map(agent => ({
    id: agent.id,
    role: agent.role,
    busy: agent.busy,
    currentWorkId: agent.currentWorkId,
    assignedAt: agent.assignedAt,
    totalWorkProcessed: agent.totalWorkProcessed,
  }))

  return c.json({
    stats,
    agents,
  })
})

export { planningRoutes }
