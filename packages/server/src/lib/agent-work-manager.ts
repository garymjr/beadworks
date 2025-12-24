/**
 * Agent Work Manager
 * Manages the lifecycle of agent work on issues
 */

import { getPiAgentSession } from './pi-agent.js'
import { updateIssue, closeIssue, addComment } from './bd-cli.js'
import { workStore } from './work-store.js'
import { buildWorkPrompt } from './prompts.js'
import { broadcastStatus, broadcastProgress, broadcastStep, broadcastError, broadcastComplete } from './events.js'

export interface WorkOptions {
  projectPath?: string
  timeout?: number // Default: 5 minutes
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

  try {
    // Update issue status to in_progress
    broadcastStatus(issueId, workId, 'starting', 'Claiming issue...')
    await updateIssue(issueId, { status: 'in_progress' }, projectPath)

    // Build the work prompt
    broadcastStatus(issueId, workId, 'thinking', 'Analyzing issue and building work plan...')
    const { prompt } = await buildWorkPrompt(issueId, projectPath)

    // Start the agent work in the background
    runAgentWork(session, issueId, workId, prompt, projectPath, timeout).catch((error) => {
      console.error(`[AgentWorkManager] Error in agent work:`, error)
    })

    return { workId, status: 'started' }
  } catch (error: any) {
    // Clean up the session if we failed to start
    workStore.errorSession(workId, error.message, false, true)
    throw error
  }
}

/**
 * Run the agent work (background function)
 */
async function runAgentWork(
  session: any,
  issueId: string,
  workId: string,
  prompt: string,
  projectPath: string | undefined,
  timeout: number
): Promise<WorkResult> {
  const startTime = Date.now()
  const filesChanged: Set<string> = new Set()
  let fullResponse = ''
  let agentComplete = false

  try {
    // Subscribe to agent events
    const unsubscribe = session.subscribe((event: any) => {
      const workSession = workStore.getSession(workId)
      if (!workSession) return

      try {
        switch (event.type) {
          case 'message_update':
            const msgEvent = event.assistantMessageEvent
            if (msgEvent && msgEvent.type === 'text_delta') {
              fullResponse += msgEvent.delta

              // Stream text deltas as step events
              workStore.addStepEvent(workId, 'text_delta', msgEvent.delta)
            }
            break

          case 'tool_execution_start':
            // Agent is using a tool
            workStore.addStepEvent(
              workId,
              'tool_call',
              `Using tool: ${event.toolName || 'unknown'}`,
              { toolName: event.toolName }
            )

            // Track file operations
            if (event.toolName === 'write' || event.toolName === 'edit') {
              // The tool arguments should contain the file path
              // This is a simplified tracking - in real implementation, parse the arguments
              const args = event.arguments || {}
              if (args.path) {
                filesChanged.add(args.path)
              }
            }
            break

          case 'tool_execution_end':
            // Tool execution result
            if (event.error) {
              workStore.addStepEvent(
                workId,
                'tool_call',
                `Tool error: ${event.error}`,
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

    // Update status and send the prompt
    workStore.updateStatus(workId, 'working', 'Agent is working on the issue...')
    workStore.updateProgress(workId, 10, 'Starting work...')

    await session.prompt(prompt)

    // Wait for the agent to complete or timeout
    const maxWaitTime = timeout
    const checkInterval = 100
    
    while (!agentComplete && Date.now() - startTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, checkInterval))
      
      // Update progress based on elapsed time (rough estimate)
      const elapsed = Date.now() - startTime
      const estimatedProgress = Math.min(90, 10 + Math.floor((elapsed / maxWaitTime) * 80))
      workStore.updateProgress(workId, estimatedProgress, 'Working...')
    }

    unsubscribe()

    if (!agentComplete) {
      throw new Error('Agent work timed out')
    }

    // Extract summary from the response
    const summary = extractSummary(fullResponse)
    const changedFiles = Array.from(filesChanged)

    // Close the issue with the result
    await closeIssueWithReason(issueId, summary, projectPath)

    // Mark session as complete
    workStore.completeSession(workId, true, summary, changedFiles)

    return {
      success: true,
      workId,
      summary,
      filesChanged: changedFiles,
      duration: Date.now() - startTime,
    }
  } catch (error: any) {
    // Mark session as errored
    workStore.errorSession(workId, error.message, true, true)

    // Add a comment about the failure
    try {
      await addComment(issueId, `❌ Agent work failed: ${error.message}`, projectPath)
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
 * Close an issue with a reason
 */
async function closeIssueWithReason(
  issueId: string,
  reason: string,
  projectPath?: string
): Promise<void> {
  try {
    // For bd CLI, we need to use the --reason flag
    // But the closeIssue function doesn't support that yet
    // So we'll add a comment and then close
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
  
  // Note: We can't actually cancel the running agent session
  // The agent will complete its current work but we'll ignore the results
  
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
