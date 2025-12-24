/**
 * In-memory work state tracking for active agent work sessions
 * Tracks progress and state of work on issues
 */

import { promises as fs } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { agentEvents, type AgentEvent, broadcastStatus, broadcastProgress, broadcastStep, broadcastError, broadcastComplete } from './events.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

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
  private readonly PERSIST_DIR = join(process.cwd(), '.beads')
  private readonly PERSIST_FILE = join(this.PERSIST_DIR, 'work-sessions.json')
  private persistTimer: NodeJS.Timeout | null = null

  constructor() {
    // Restore sessions on startup
    this.restore().catch((err) => {
      console.error('[WorkStore] Failed to restore sessions:', err)
    })
  }

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

    // Persist to disk
    this.schedulePersist()

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

    // Persist status changes
    this.schedulePersist()
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

    // Persist progress changes (debounced)
    this.schedulePersist()
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

    // Don't persist every step event - too frequent
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

    // Persist completion
    this.schedulePersist()
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

    // Persist errors
    this.schedulePersist()
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

    // Persist cancellation
    this.schedulePersist()
  }

  /**
   * Check if a session is complete (done, error, or cancelled)
   */
  private isComplete(session: WorkSession): boolean {
    return ['complete', 'error', 'cancelled'].includes(session.status)
  }

  /**
   * Schedule a persist operation with debouncing
   * Persists at most once every 5 seconds
   */
  private schedulePersist(): void {
    if (this.persistTimer) {
      return // Already scheduled
    }

    this.persistTimer = setTimeout(() => {
      this.persist().catch((err) => {
        console.error('[WorkStore] Failed to persist sessions:', err)
      })
      this.persistTimer = null
    }, 5000)
  }

  /**
   * Persist sessions to disk
   */
  private async persist(): Promise<void> {
    try {
      // Ensure .beads directory exists
      await fs.mkdir(this.PERSIST_DIR, { recursive: true })

      // Convert Map to array for JSON serialization
      const sessionsArray = Array.from(this.sessions.entries())

      await fs.writeFile(
        this.PERSIST_FILE,
        JSON.stringify(sessionsArray, null, 2),
        'utf-8'
      )

      console.log(`[WorkStore] Persisted ${sessionsArray.length} sessions to disk`)
    } catch (error) {
      console.error('[WorkStore] Failed to persist sessions:', error)
    }
  }

  /**
   * Restore sessions from disk on startup
   */
  private async restore(): Promise<void> {
    try {
      // Check if persist file exists
      try {
        await fs.access(this.PERSIST_FILE)
      } catch {
        console.log('[WorkStore] No persist file found, starting fresh')
        return
      }

      // Read and parse the persist file
      const data = await fs.readFile(this.PERSIST_FILE, 'utf-8')
      const sessionsArray: Array<[string, WorkSession]> = JSON.parse(data)

      // Restore sessions
      const restoredSessions: Map<string, WorkSession> = new Map(sessionsArray)

      // Clean up old completed sessions (older than 1 hour)
      const oneHourAgo = Date.now() - 60 * 60 * 1000
      let cleanedCount = 0

      for (const [workId, session] of restoredSessions.entries()) {
        if (this.isComplete(session) && session.endTime && session.endTime < oneHourAgo) {
          restoredSessions.delete(workId)
          cleanedCount++
        }
      }

      this.sessions = restoredSessions

      console.log(
        `[WorkStore] Restored ${restoredSessions.size} sessions from disk (cleaned ${cleanedCount} old ones)`
      )

      // Trigger persist to update the file with cleaned sessions
      if (cleanedCount > 0) {
        this.schedulePersist()
      }
    } catch (error) {
      console.error('[WorkStore] Failed to restore sessions:', error)
    }
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

    // Persist after cleanup
    this.schedulePersist()
  }
}

// Global work store instance
export const workStore = new WorkStore()

// Cleanup old sessions every 10 minutes
setInterval(() => {
  workStore.cleanup()
}, 10 * 60 * 1000)
