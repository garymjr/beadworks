/**
 * Agent Thinking Level Configuration
 * Manages dynamic thinking level configuration for the agent workflow
 *
 * IMPORTANT: This implementation works with a single AgentSession.
 * Multiple work sessions can exist, but only one agent operation runs at a time.
 * The thinking level is set appropriately before each session's operation.
 */

import { getPiAgentSession } from './pi-agent.js'
import { workStore } from './work-store.js'

/**
 * Valid thinking levels as defined by the SDK
 * Based on: https://raw.githubusercontent.com/badlogic/pi-mono/refs/heads/main/packages/coding-agent/docs/sdk.md
 */
export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

/**
 * Agent phase for context tracking
 */
export type AgentPhase = 'planning' | 'execution' | 'idle'

/**
 * Set the thinking level for a specific work session
 * This should be called before the agent starts work in that phase
 *
 * @param workId - The work session ID
 * @param level - The thinking level to set
 * @param phase - The agent phase (for logging context)
 * @throws Error if agent session is not available
 */
export function setThinkingLevel(workId: string, level: ThinkingLevel, phase?: AgentPhase): void {
  try {
    const session = getPiAgentSession()

    if (!session) {
      throw new Error('Agent session not initialized. Call initializePiAgent() first.')
    }

    // Get the work session for logging context
    const workSession = workStore.getSession(workId)
    const issueContext = workSession ? ` (issue: ${workSession.issueId})` : ''

    // Set the thinking level via SDK
    session.setThinkingLevel(level)

    // Log the change with context
    const phaseContext = phase ? ` (${phase} phase)` : ''
    console.log(`[AgentThinking] Work ${workId}${issueContext}: thinking level set to "${level}"${phaseContext}`)
  } catch (error) {
    console.error(`[AgentThinking] Work ${workId}: Failed to set thinking level to "${level}":`, error)
    throw error
  }
}

/**
 * Get the current thinking level from the agent session
 * @returns The current thinking level, or 'off' if unknown
 */
export function getThinkingLevel(): ThinkingLevel {
  try {
    const session = getPiAgentSession()

    if (!session) {
      console.warn('[AgentThinking] Agent session not initialized, returning default level "off"')
      return 'off'
    }

    // Get the actual level from the session
    return session.thinkingLevel
  } catch (error) {
    console.error('[AgentThinking] Error getting thinking level:', error)
    return 'off'
  }
}

/**
 * Set thinking level for planning phase for a specific work session
 * Uses 'medium' thinking for thorough reasoning and task breakdown
 */
export function setPlanningThinkingLevel(workId: string): void {
  setThinkingLevel(workId, 'medium', 'planning')
}

/**
 * Set thinking level for execution phase for a specific work session
 * Uses 'off' thinking to reduce latency during task execution
 */
export function setExecutionThinkingLevel(workId: string): void {
  setThinkingLevel(workId, 'off', 'execution')
}

/**
 * Reset thinking level to default (off) for a specific work session
 */
export function resetThinkingLevel(workId: string): void {
  setThinkingLevel(workId, 'off', 'idle')
}

/**
 * Check if the thinking level infrastructure is ready
 * @returns true if agent session is available
 */
export function isThinkingLevelReady(): boolean {
  const session = getPiAgentSession()
  return session !== null
}
