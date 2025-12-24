/**
 * In-memory work state tracking for active agent work sessions
 * Tracks progress and state of work on issues
 */

import { agentEvents, type AgentEvent, broadcastStatus, broadcastProgress, broadcastStep, broadcastError, broadcastComplete } from './events.js'

export interface WorkSession {
  workId: string
  issueId: string
  projectPath: string
  status: 'starting' | 'thinking' | 'working' | 'complete' | 'error' | 'cancelled'
  startTime: number
  endTime?: number
  progress: number
  currentStep: string
  totalSteps?: number
  events: Array<{
    type: string
    timestamp: number
    data: any
  }>
  error?: {
    message: string
    recoverable: boolean
    canRetry: boolean
  }
  result?: {
    success: boolean
    summary: string
    filesChanged: string[]
  }
}

class WorkStore {
  private sessions: Map<string, WorkSession> = new Map()

  /**
   * Subscribe to agent events
   * Returns an unsubscribe function
   */
  subscribe(listener: (event: AgentEvent) => void): () => void {
    return agentEvents.subscribe(listener)
  }

  /**
   * Create a new work session
   */
  createSession(issueId: string, projectPath: string): WorkSession {
    const workId = `work-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    
    const session: WorkSession = {
      workId,
      issueId,
      projectPath,
      status: 'starting',
      startTime: Date.now(),
      progress: 0,
      currentStep: 'Initializing...',
      events: [],
    }

    this.sessions.set(workId, session)
    
    // Broadcast initial status
    broadcastStatus(issueId, workId, 'starting', 'Agent is initializing')
    
    console.log(`[WorkStore] Created session ${workId} for issue ${issueId}`)
    return session
  }

  /**
   * Get a session by work ID
   */
  getSession(workId: string): WorkSession | undefined {
    return this.sessions.get(workId)
  }

  /**
   * Get active session for an issue
   */
  getActiveSession(issueId: string): WorkSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.issueId === issueId && !this.isComplete(session)) {
        return session
      }
    }
    return undefined
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): WorkSession[] {
    return Array.from(this.sessions.values()).filter(s => !this.isComplete(s))
  }

  /**
   * Update session status
   */
  updateStatus(workId: string, status: WorkSession['status'], message?: string): void {
    const session = this.sessions.get(workId)
    if (!session) return

    session.status = status
    session.currentStep = message || session.currentStep
    
    session.events.push({
      type: 'status',
      timestamp: Date.now(),
      data: { status, message },
    })

    broadcastStatus(session.issueId, workId, status, message)
    console.log(`[WorkStore] Session ${workId} status: ${status}`)
  }

  /**
   * Update session progress
   */
  updateProgress(workId: string, progress: number, currentStep: string, totalSteps?: number): void {
    const session = this.sessions.get(workId)
    if (!session) return

    session.progress = Math.min(100, Math.max(0, progress))
    session.currentStep = currentStep
    if (totalSteps) session.totalSteps = totalSteps
    
    session.events.push({
      type: 'progress',
      timestamp: Date.now(),
      data: { progress, currentStep, totalSteps },
    })

    broadcastProgress(session.issueId, workId, progress, currentStep, totalSteps)
  }

  /**
   * Add a step event to the session
   */
  addStepEvent(
    workId: string,
    stepType: 'tool_call' | 'file_read' | 'file_write' | 'shell_command' | 'text_delta',
    content: string,
    options?: { toolName?: string; filePath?: string }
  ): void {
    const session = this.sessions.get(workId)
    if (!session) return

    session.events.push({
      type: 'step',
      timestamp: Date.now(),
      data: { stepType, content, ...options },
    })

    broadcastStep(session.issueId, workId, stepType, content, options)
  }

  /**
   * Mark session as complete
   */
  completeSession(workId: string, success: boolean, summary: string, filesChanged: string[] = []): void {
    const session = this.sessions.get(workId)
    if (!session) return

    session.status = success ? 'complete' : 'error'
    session.endTime = Date.now()
    session.progress = 100
    session.currentStep = success ? 'Completed' : 'Failed'
    session.result = {
      success,
      summary,
      filesChanged,
    }

    const duration = session.endTime - session.startTime
    broadcastComplete(session.issueId, workId, success, summary, duration, filesChanged)
    
    console.log(`[WorkStore] Session ${workId} ${success ? 'completed' : 'failed'} in ${duration}ms`)
  }

  /**
   * Mark session as errored
   */
  errorSession(workId: string, error: string, recoverable: boolean = false, canRetry: boolean = false): void {
    const session = this.sessions.get(workId)
    if (!session) return

    session.status = 'error'
    session.endTime = Date.now()
    session.error = {
      message: error,
      recoverable,
      canRetry,
    }

    broadcastError(session.issueId, workId, error, recoverable, canRetry)
    
    console.error(`[WorkStore] Session ${workId} error: ${error}`)
  }

  /**
   * Cancel a session
   */
  cancelSession(workId: string): void {
    const session = this.sessions.get(workId)
    if (!session) return

    session.status = 'cancelled'
    session.endTime = Date.now()
    
    broadcastStatus(session.issueId, workId, 'error', 'Work was cancelled')
    
    console.log(`[WorkStore] Session ${workId} cancelled`)
  }

  /**
   * Check if a session is complete (done, error, or cancelled)
   */
  private isComplete(session: WorkSession): boolean {
    return ['complete', 'error', 'cancelled'].includes(session.status)
  }

  /**
   * Clean up old completed sessions (older than 1 hour)
   */
  cleanup(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000
    
    for (const [workId, session] of this.sessions.entries()) {
      if (this.isComplete(session) && session.endTime && session.endTime < oneHourAgo) {
        this.sessions.delete(workId)
        console.log(`[WorkStore] Cleaned up session ${workId}`)
      }
    }
  }
}

// Global work store instance
export const workStore = new WorkStore()

// Cleanup old sessions every 10 minutes
setInterval(() => {
  workStore.cleanup()
}, 10 * 60 * 1000)
