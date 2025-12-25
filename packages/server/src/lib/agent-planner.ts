/**
 * Agent Planner
 * Handles planning phase using the dedicated planning agent from the pool
 * Generates plans and subtasks for issues
 */

import { showIssue } from './bd-cli.js'
import { getAgentPool, type PoolAgent } from './agent-pool.js'
import { buildPlanPrompt } from './prompts.js'

/**
 * Planning result
 */
export interface PlanningResult {
  success: boolean
  plan?: string
  subtasks?: Array<{
    title: string
    description: string
    type: string
  }>
  risks?: string[]
  agentUsed?: string
  duration: number
}

/**
 * Generate a plan for an issue using the planning agent
 */
export async function generatePlan(
  issueId: string,
  projectPath?: string,
  timeout = 60000
): Promise<PlanningResult> {
  const pool = getAgentPool()
  const startTime = Date.now()
  let planningAgent: PoolAgent | null = null

  try {
    console.log(`[AgentPlanner] Generating plan for issue ${issueId}...`)

    // Get issue details
    const issueResult = await showIssue(issueId, projectPath)
    const issue = Array.isArray(issueResult) ? issueResult[0] : issueResult

    if (!issue) {
      throw new Error(`Issue ${issueId} not found`)
    }

    const title = issue.title || issue.Title || ''
    const description = issue.description || issue.Description || issue.body || issue.content || ''
    const type = issue.type || issue.issue_type || issue.Type || 'task'

    // Acquire planning agent from pool
    console.log(`[AgentPlanner] Acquiring planning agent for issue ${issueId}...`)
    planningAgent = await pool.acquireAgent('planning', `plan-${issueId}`, timeout)

    console.log(`[AgentPlanner] Agent ${planningAgent.id} generating plan for: ${title}`)

    // Build planning prompt
    const prompt = buildPlanPrompt(title, description, type)

    // Let the planning agent generate the plan
    let fullResponse = ''
    let agentComplete = false

    const unsubscribe = planningAgent.session.subscribe((event: any) => {
      if (event.type === 'message_update') {
        const msgEvent = event.assistantMessageEvent
        if (msgEvent && msgEvent.type === 'text_delta') {
          fullResponse += msgEvent.delta
        }
      } else if (event.type === 'agent_end') {
        agentComplete = true
      }
    })

    await planningAgent.session.prompt(prompt)

    // Wait for completion
    const checkInterval = 100
    while (!agentComplete && Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, checkInterval))
    }

    unsubscribe()

    if (!agentComplete) {
      throw new Error('Planning agent timed out')
    }

    // Parse the JSON response
    const jsonMatch = fullResponse.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Planning agent did not return valid JSON')
    }

    const planData = JSON.parse(jsonMatch[0])

    console.log(`[AgentPlanner] Agent ${planningAgent.id} generated plan with ${planData.subtasks?.length || 0} subtasks`)

    return {
      success: true,
      plan: planData.plan,
      subtasks: planData.subtasks || [],
      risks: planData.risks || [],
      agentUsed: planningAgent.id,
      duration: Date.now() - startTime,
    }
  } catch (error: any) {
    console.error(`[AgentPlanner] Error generating plan for issue ${issueId}:`, error)

    return {
      success: false,
      duration: Date.now() - startTime,
    }
  } finally {
    // Always release the planning agent
    if (planningAgent) {
      pool.releaseAgent(planningAgent.id)
      console.log(`[AgentPlanner] Released planning agent ${planningAgent.id}`)
    }
  }
}
