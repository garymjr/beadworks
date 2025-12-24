/**
 * Agent Work Manager
 * Manages the lifecycle of agent work on issues
 * Processes subtasks sequentially, one at a time
 */

import { getPiAgentSession } from './pi-agent.js'
import { updateIssue, closeIssue, addComment, getSubtasks, showIssue } from './bd-cli.js'
import { workStore } from './work-store.js'
import { buildPromptForSubtask } from './prompts.js'
import { broadcastStep, broadcastError, broadcastComplete } from './events.js'

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
}

/**
 * Start work on an issue using the pi-agent
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

  // Get the pi-agent session
  const session = getPiAgentSession()
  if (!session) {
    throw new Error('Pi-agent session not initialized. Please start the server first.')
  }

  // Create a new work session
  const workSession = workStore.createSession(issueId, projectPath || process.cwd())
  const { workId } = workSession

  // Update issue status to in_progress
  workStore.updateStatus(workId, 'starting', 'Claiming issue...')
  await updateIssue(issueId, { status: 'in_progress' }, projectPath)

  // Start the agent work in the background with error handling
  runAgentWork(session, issueId, workId, projectPath, timeout).catch((error) => {
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
 * Processes all subtasks sequentially
 */
async function runAgentWork(
  session: any,
  issueId: string,
  workId: string,
  projectPath: string | undefined,
  timeout: number
): Promise<WorkResult> {
  const startTime = Date.now()
  const allFilesChanged: Set<string> = new Set()
  const completedSubtasks: string[] = []
  const failedSubtasks: Array<{ id: string; error: string }> = []
  let totalSubtasks = 0

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

    // Process each subtask
    for (let i = 0; i < pendingSubtasks.length; i++) {
      const subtask = pendingSubtasks[i]
      const subtaskNum = i + 1
      const percentComplete = Math.round((i / totalSubtasks) * 100)

      workStore.updateProgress(
        workId,
        percentComplete,
        `Working on subtask ${subtaskNum}/${totalSubtasks}: ${subtask.title}`,
        totalSubtasks
      )

      try {
        const result = await processSubtask(
          session,
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
          `Completed subtask ${subtaskNum}/${totalSubtasks}: ${subtask.title}`,
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

    // Close the parent issue
    await closeIssueWithReason(issueId, summary, projectPath)

    workStore.completeSession(workId, success, summary, changedFiles)

    return {
      success,
      workId,
      summary,
      filesChanged: changedFiles,
      duration,
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
  }
}

/**
 * Process a single subtask
 */
async function processSubtask(
  session: any,
  subtask: any,
  parentIssueId: string,
  workId: string,
  projectPath: string | undefined,
  timeout: number,
  subtaskNum: number,
  totalSubtasks: number
): Promise<{ success: boolean; filesChanged: string[] }> {
  const subtaskFilesChanged: Set<string> = new Set()
  let fullResponse = ''
  let agentComplete = false

  console.log(`[AgentWorkManager] Processing subtask ${subtask.id}: ${subtask.title}`)

  // Mark subtask as in_progress
  await updateIssue(subtask.id, { status: 'in_progress' }, projectPath)
  workStore.updateStatus(workId, 'working', `Starting: ${subtask.title}`)

  try {
    // Build prompt for this subtask
    const { prompt } = await buildPromptForSubtask(subtask, parentIssueId, projectPath)

    // Subscribe to agent events
    const unsubscribe = session.subscribe((event: any) => {
      try {
        switch (event.type) {
          case 'message_update':
            const msgEvent = event.assistantMessageEvent
            if (msgEvent && msgEvent.type === 'text_delta') {
              fullResponse += msgEvent.delta
              // Don't broadcast text_delta events - they're noisy streaming tokens
              // Only accumulate internally for the final summary
            }
            break

          case 'tool_execution_start':
            workStore.addStepEvent(
              workId,
              'tool_call',
              `[${subtaskNum}/${totalSubtasks}] Using tool: ${event.toolName || 'unknown'}`,
              { toolName: event.toolName }
            )

            if (event.toolName === 'write' || event.toolName === 'edit') {
              const args = event.arguments || {}
              if (args.path) {
                subtaskFilesChanged.add(args.path)
              }
            }
            break

          case 'tool_execution_end':
            if (event.error) {
              workStore.addStepEvent(
                workId,
                'tool_call',
                `[${subtaskNum}/${totalSubtasks}] Tool error: ${event.error}`,
                { toolName: event.toolName }
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
    await session.prompt(prompt)

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

    // Extract summary from response
    const summary = extractSummary(fullResponse)

    // Close the subtask
    await addComment(subtask.id, `✅ Completed by agent:\n\n${summary}`, projectPath)
    await closeIssue(subtask.id, projectPath)

    workStore.updateStatus(workId, 'working', `Completed: ${subtask.title}`)

    return {
      success: true,
      filesChanged: Array.from(subtaskFilesChanged),
    }
  } catch (error: any) {
    console.error(`[AgentWorkManager] Error processing subtask ${subtask.id}:`, error)

    // Mark subtask as failed (reset to open)
    try {
      await updateIssue(subtask.id, { status: 'open' }, projectPath)
      await addComment(subtask.id, `❌ Failed: ${error.message}`, projectPath)
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
 */
export function getWorkStatus(issueId: string) {
  const session = workStore.getActiveSession(issueId)
  if (!session) {
    return { status: 'not_found' }
  }

  return {
    workId: session.workId,
    status: session.status,
    progress: session.progress,
    currentStep: session.currentStep,
    startTime: session.startTime,
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
