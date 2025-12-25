/**
 * Agent Work Manager with Pool Support
 * Manages the lifecycle of agent work on issues using the agent pool
 * Processes subtasks sequentially, one at a time, with agents from the pool
 */

import { updateIssue, closeIssue, addComment, getSubtasks, showIssue } from './bd-cli.js'
import { workStore } from './work-store.js'
import { buildPromptForSubtask, buildPlanPrompt } from './prompts.js'
import { broadcastStep, broadcastError, broadcastComplete } from './events.js'
import { getAgentPool, type PoolAgent } from './agent-pool.js'

export interface WorkOptions {
  projectPath?: string
  timeout?: number // Default: 5 minutes per subtask
}

export interface WorkResult {
  success: boolean
  workId: string
  summary: string
  filesChanged: string[]
  duration: number
  agentUsed?: string // Which agent processed the work
}

/**
 * Start work on an issue using the agent pool
 * If the issue has subtasks, processes them one at a time
 */
export async function startWorkOnIssue(
  issueId: string,
  options: WorkOptions = {}
): Promise<{ workId: string; status: string }> {
  const { projectPath, timeout = 5 * 60 * 1000 } = options

  // Check if there's already active work on this issue
  const existingSession = workStore.getActiveSession(issueId)
  if (existingSession) {
    throw new Error(`Issue ${issueId} already has active work (session: ${existingSession.workId})`)
  }

  // Create a new work session
  const workSession = workStore.createSession(issueId, projectPath || process.cwd())
  const { workId } = workSession

  // Update issue status to in_progress
  workStore.updateStatus(workId, 'starting', 'Claiming issue...')
  await updateIssue(issueId, { status: 'in_progress' }, projectPath)

  // Start the agent work in the background with error handling
  runAgentWork(issueId, workId, projectPath, timeout).catch((error) => {
    console.error(`[AgentWorkManager] Unhandled error in runAgentWork:`, error)
    // Ensure error is broadcast and issue is reset
    workStore.errorSession(workId, error?.message || 'Unknown error', false, false)
    updateIssue(issueId, { status: 'open' }, projectPath).catch((e) => {
      console.error('[AgentWorkManager] Failed to reset issue status:', e)
    })
  })

  return { workId, status: 'started' }
}

/**
 * Run the agent work (background function)
 * Processes all subtasks sequentially using agents from the pool
 */
async function runAgentWork(
  issueId: string,
  workId: string,
  projectPath: string | undefined,
  timeout: number
): Promise<WorkResult> {
  const pool = getAgentPool()
  const startTime = Date.now()
  const allFilesChanged: Set<string> = new Set()
  const completedSubtasks: string[] = []
  const failedSubtasks: Array<{ id: string; error: string }> = []
  let totalSubtasks = 0
  let executionAgent: PoolAgent | null = null

  try {
    // Get subtasks for this issue
    workStore.updateStatus(workId, 'thinking', 'Fetching subtasks...')
    const { subtasks, progress } = await getSubtasks(issueId, projectPath)

    console.log(`[AgentWorkManager] Found ${subtasks.length} subtasks (${progress.completed} already complete)`)

    // Filter out already-closed subtasks
    const pendingSubtasks = subtasks.filter((st: any) => st.status !== 'closed')
    totalSubtasks = pendingSubtasks.length

    if (pendingSubtasks.length === 0) {
      workStore.updateStatus(workId, 'working', 'All subtasks already complete!')
      await closeIssueWithReason(issueId, 'All subtasks were already completed', projectPath)
      workStore.completeSession(workId, true, 'All subtasks were already completed', [])
      return {
        success: true,
        workId,
        summary: 'All subtasks were already completed',
        filesChanged: [],
        duration: Date.now() - startTime,
      }
    }

    // Acquire an execution agent from the pool
    workStore.updateStatus(workId, 'acquiring', 'Acquiring execution agent from pool...')
    console.log(`[AgentWorkManager] Work ${workId}: acquiring execution agent...`)

    executionAgent = await pool.acquireAgent('execution', workId, timeout)
    workStore.updateStatus(workId, 'working', `Agent ${executionAgent.id} processing ${totalSubtasks} subtasks...`)

    // Process each subtask
    for (let i = 0; i < pendingSubtasks.length; i++) {
      const subtask = pendingSubtasks[i]
      const subtaskNum = i + 1
      const percentComplete = Math.round((i / totalSubtasks) * 100)

      workStore.updateProgress(
        workId,
        percentComplete,
        `[Agent ${executionAgent.id}] Working on subtask ${subtaskNum}/${totalSubtasks}: ${subtask.title}`,
        totalSubtasks
      )

      try {
        const result = await processSubtask(
          executionAgent,
          subtask,
          issueId,
          workId,
          projectPath,
          timeout,
          subtaskNum,
          totalSubtasks
        )

        completedSubtasks.push(subtask.id)
        result.filesChanged.forEach((f) => allFilesChanged.add(f))

        workStore.updateProgress(
          workId,
          Math.round(((i + 1) / totalSubtasks) * 100),
          `[Agent ${executionAgent.id}] Completed subtask ${subtaskNum}/${totalSubtasks}: ${subtask.title}`,
          totalSubtasks
        )
      } catch (error: any) {
        console.error(`[AgentWorkManager] Failed to process subtask ${subtask.id}:`, error)
        failedSubtasks.push({ id: subtask.id, error: error.message })

        // Add error comment
        await addComment(subtask.id, `❌ Failed to process subtask: ${error.message}`, projectPath)
      }
    }

    // All subtasks processed
    const success = failedSubtasks.length === 0
    const duration = Date.now() - startTime
    const changedFiles = Array.from(allFilesChanged)

    let summary = `Completed ${completedSubtasks.length} of ${totalSubtasks} subtasks.`
    if (failedSubtasks.length > 0) {
      summary += ` Failed: ${failedSubtasks.map((f) => f.id).join(', ')}.`
    }

    // Only close the parent issue if ALL subtasks succeeded
    if (success) {
      await closeIssueWithReason(issueId, summary, projectPath)
      workStore.completeSession(workId, true, summary, changedFiles)
    } else {
      // Some subtasks failed - leave parent issue open with a summary
      await addComment(issueId, `⚠️ Partial completion:\n\n${summary}\n\nThe failed subtasks need to be addressed. The issue remains open until all subtasks are completed.`, projectPath)
      await updateIssue(issueId, { status: 'open' }, projectPath)
      workStore.completeSession(workId, false, summary, changedFiles)
    }

    return {
      success,
      workId,
      summary,
      filesChanged: changedFiles,
      duration,
      agentUsed: executionAgent.id,
    }
  } catch (error: any) {
    console.error('[AgentWorkManager] Fatal error in runAgentWork:', error)

    // Mark session as errored
    workStore.errorSession(workId, error.message, false, false)

    // Reset issue status to open if it failed
    try {
      await updateIssue(issueId, { status: 'open' }, projectPath)
    } catch (updateError) {
      console.error('[AgentWorkManager] Failed to reset issue status:', updateError)
    }

    // Add a comment about the failure
    try {
      await addComment(
        issueId,
        `❌ Agent work failed:\n\n**Error:** ${error.message}\n\n**Completed subtasks:** ${completedSubtasks.length}/${totalSubtasks}\n${
          failedSubtasks.length > 0 ? `**Failed subtasks:** ${failedSubtasks.map((f) => f.id).join(', ')}` : ''
        }`,
        projectPath
      )
    } catch (commentError) {
      console.error('[AgentWorkManager] Failed to add error comment:', commentError)
    }

    return {
      success: false,
      workId,
      summary: `Failed: ${error.message}`,
      filesChanged: [],
      duration: Date.now() - startTime,
    }
  } finally {
    // Always release the agent back to the pool
    if (executionAgent) {
      pool.releaseAgent(executionAgent.id)
      console.log(`[AgentWorkManager] Work ${workId}: released agent ${executionAgent.id}`)
    }
  }
}

/**
 * Process a single subtask using a specific agent from the pool
 */
async function processSubtask(
  agent: PoolAgent,
  subtask: any,
  parentIssueId: string,
  workId: string,
  projectPath: string | undefined,
  timeout: number,
  subtaskNum: number,
  totalSubtasks: number
): Promise<{ success: boolean; filesChanged: string[] }> {
  const subtaskFilesChanged: Set<string> = new Set()
  const toolsExecuted: Set<string> = new Set()
  let fullResponse = ''
  let agentComplete = false
  let toolErrors: Array<{ tool: string; error: string }> = []

  console.log(`[AgentWorkManager] Agent ${agent.id}: Processing subtask ${subtask.id}: ${subtask.title}`)

  // Mark subtask as in_progress
  await updateIssue(subtask.id, { status: 'in_progress' }, projectPath)
  workStore.updateStatus(workId, 'working', `[Agent ${agent.id}] Starting: ${subtask.title}`)

  try {
    // Build prompt for this subtask
    const { prompt } = await buildPromptForSubtask(subtask, parentIssueId, projectPath)

    // Subscribe to agent events
    const unsubscribe = agent.session.subscribe((event: any) => {
      try {
        switch (event.type) {
          case 'message_update':
            const msgEvent = event.assistantMessageEvent
            if (msgEvent && msgEvent.type === 'text_delta') {
              fullResponse += msgEvent.delta
            }
            break

          case 'tool_execution_start':
            workStore.addStepEvent(
              workId,
              'tool_call',
              `[Agent ${agent.id}][${subtaskNum}/${totalSubtasks}] Using tool: ${event.toolName || 'unknown'}`,
              { toolName: event.toolName, agentId: agent.id }
            )

            if (event.toolName) {
              toolsExecuted.add(event.toolName)
            }

            if (event.toolName === 'write' || event.toolName === 'edit') {
              const args = event.arguments || {}
              if (args.path) {
                subtaskFilesChanged.add(args.path)
              }
            }
            break

          case 'tool_execution_end':
            if (event.error) {
              toolErrors.push({ tool: event.toolName || 'unknown', error: event.error })
              workStore.addStepEvent(
                workId,
                'tool_call',
                `[Agent ${agent.id}][${subtaskNum}/${totalSubtasks}] Tool error: ${event.error}`,
                { toolName: event.toolName, agentId: agent.id }
              )
            }
            break

          case 'agent_end':
            agentComplete = true
            break
        }
      } catch (err) {
        console.error(`[AgentWorkManager] Error handling event:`, err)
      }
    })

    // Send prompt and wait for response
    await agent.session.prompt(prompt)

    // Wait for the agent to complete or timeout
    const subtaskStartTime = Date.now()
    const maxWaitTime = timeout
    const checkInterval = 100

    while (!agentComplete && Date.now() - subtaskStartTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, checkInterval))
    }

    unsubscribe()

    if (!agentComplete) {
      throw new Error('Agent work timed out')
    }

    // VALIDATE: Check if actual work was performed
    const hasWorkEvidence = validateWorkPerformed(toolsExecuted, subtaskFilesChanged, toolErrors)

    if (!hasWorkEvidence.valid) {
      // No actual work was done - leave subtask open with a comment
      const message = `⚠️ Agent did not perform actual work for this subtask.\n\n` +
        `**Reason:** ${hasWorkEvidence.reason}\n\n` +
        `**Agent:** ${agent.id}\n` +
        `**Tools used:** ${Array.from(toolsExecuted).join(', ') || 'none'}\n` +
        `**Files modified:** ${Array.from(subtaskFilesChanged).join(', ') || 'none'}\n` +
        `**Tool errors:** ${toolErrors.length > 0 ? toolErrors.map(e => `${e.tool}: ${e.error}`).join('; ') : 'none'}\n\n` +
        `This subtask needs manual attention or clarification. The agent may have:\n` +
        `- Needed more context or information\n` +
        `- Encountered an unclear description\n` +
        `- Required clarification on implementation approach\n\n` +
        `**Agent response excerpt:**\n${fullResponse.substring(0, 500)}${fullResponse.length > 500 ? '...' : ''}`

      await addComment(subtask.id, message, projectPath)

      // Reset to open status so it can be retried or handled manually
      await updateIssue(subtask.id, { status: 'open' }, projectPath)

      throw new Error(`Subtask not completed: ${hasWorkEvidence.reason}`)
    }

    // Extract summary from response
    const summary = extractSummary(fullResponse)

    // Close the subtask
    await addComment(subtask.id, `✅ Completed by agent ${agent.id}:\n\n${summary}`, projectPath)
    await closeIssue(subtask.id, projectPath)

    workStore.updateStatus(workId, 'working', `[Agent ${agent.id}] Completed: ${subtask.title}`)

    return {
      success: true,
      filesChanged: Array.from(subtaskFilesChanged),
    }
  } catch (error: any) {
    console.error(`[AgentWorkManager] Agent ${agent.id}: Error processing subtask ${subtask.id}:`, error)

    // Mark subtask as failed (reset to open)
    try {
      await updateIssue(subtask.id, { status: 'open' }, projectPath)
      await addComment(subtask.id, `❌ Failed by agent ${agent.id}: ${error.message}`, projectPath)
    } catch (commentError) {
      console.error(`[AgentWorkManager] Failed to update subtask ${subtask.id}:`, commentError)
    }

    throw error
  }
}

/**
 * Close an issue with a reason
 */
async function closeIssueWithReason(
  issueId: string,
  reason: string,
  projectPath?: string
): Promise<void> {
  try {
    await addComment(issueId, `✅ Completed by agent:\n\n${reason}`, projectPath)
    await closeIssue(issueId, projectPath)
  } catch (error) {
    console.error('[AgentWorkManager] Failed to close issue:', error)
    throw error
  }
}

/**
 * Validate that actual work was performed by the agent
 */
function validateWorkPerformed(
  toolsExecuted: Set<string>,
  filesChanged: Set<string>,
  toolErrors: Array<{ tool: string; error: string }>
): { valid: boolean; reason?: string } {
  // Check for critical tool errors that would indicate work couldn't be done
  const criticalErrors = toolErrors.filter(e =>
    e.error.includes('file not found') ||
    e.error.includes('permission denied') ||
    e.error.includes('does not exist')
  )

  if (criticalErrors.length > 0) {
    return {
      valid: false,
      reason: `Critical errors prevented work: ${criticalErrors.map(e => e.error).join(', ')}`
    }
  }

  // Check if any files were modified (strongest evidence of work)
  if (filesChanged.size > 0) {
    return { valid: true }
  }

  // Check if any productive tools were used
  const productiveTools = new Set(['write', 'edit', 'bash'])
  const hasProductiveToolCalls = Array.from(toolsExecuted).some(t => productiveTools.has(t))

  if (hasProductiveToolCalls) {
    if (toolsExecuted.has('read') && toolsExecuted.size === 1) {
      return {
        valid: false,
        reason: 'Agent only read files but made no changes. Subtask requires implementation.'
      }
    }
    return { valid: true }
  }

  // No tools were executed at all - agent just responded with text
  return {
    valid: false,
    reason: 'Agent did not execute any tools. Only provided a text response without performing actual work.'
  }
}

/**
 * Extract a summary from the agent's response
 */
function extractSummary(response: string): string {
  // Try to find a summary section
  const summaryMatch = response.match(/SUMMARY[:\s]*\n+(.*?)(?:\n\n|\n=|$)/is)
  if (summaryMatch) {
    return summaryMatch[1].trim().substring(0, 1000)
  }

  // Try to find what was implemented
  const implMatch = response.match(/IMPLEMENTED[:\s]*\n+(.*?)(?:\n\n|\n=|$)/is)
  if (implMatch) {
    return implMatch[1].trim().substring(0, 1000)
  }

  // Fall back to last paragraph
  const paragraphs = response.split('\n\n').filter(p => p.trim().length > 0)
  if (paragraphs.length > 0) {
    return paragraphs[paragraphs.length - 1].trim().substring(0, 1000)
  }

  // Last resort: truncate the response
  return response.substring(0, 500)
}

/**
 * Cancel work on an issue
 */
export async function cancelWork(issueId: string): Promise<{ status: string }> {
  const session = workStore.getActiveSession(issueId)
  if (!session) {
    throw new Error(`No active work found for issue ${issueId}`)
  }

  workStore.cancelSession(session.workId)

  return { status: 'cancelled' }
}

/**
 * Get the status of work on an issue
 * Returns null if no active session exists for the issue
 */
export function getWorkStatus(issueId: string) {
  const session = workStore.getActiveSession(issueId)
  if (!session) {
    return null
  }

  return {
    workId: session.workId,
    issueId: session.issueId,
    status: session.status,
    progress: session.progress,
    currentStep: session.currentStep,
    totalSteps: session.totalSteps,
    startTime: session.startTime,
    endTime: session.endTime,
    error: session.error,
    result: session.result,
  }
}

/**
 * Get all active work sessions
 */
export function getAllActiveWork() {
  return workStore.getActiveSessions().map(session => ({
    workId: session.workId,
    issueId: session.issueId,
    status: session.status,
    progress: session.progress,
    currentStep: session.currentStep,
    startTime: session.startTime,
  }))
}
