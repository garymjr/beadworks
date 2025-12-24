/**
 * Real-time event broadcasting system using Server-Sent Events (SSE)
 * Broadcasts agent work progress to connected clients
 */

export interface BaseAgentEvent {
  issueId: string
  workId: string
  timestamp: number
}

export interface StatusAgentEvent extends BaseAgentEvent {
  type: 'status'
  data: StatusEventData
}

export interface ProgressAgentEvent extends BaseAgentEvent {
  type: 'progress'
  data: ProgressEventData
}

export interface StepAgentEvent extends BaseAgentEvent {
  type: 'step'
  data: StepEventData
}

export interface ErrorAgentEvent extends BaseAgentEvent {
  type: 'error'
  data: ErrorEventData
}

export interface CompleteAgentEvent extends BaseAgentEvent {
  type: 'complete'
  data: CompleteEventData
}

export type AgentEvent = StatusAgentEvent | ProgressAgentEvent | StepAgentEvent | ErrorAgentEvent | CompleteAgentEvent

export interface StatusEventData {
  status: 'starting' | 'thinking' | 'working' | 'complete' | 'error' | 'cancelled'
  message?: string
}

export interface ProgressEventData {
  percent: number
  currentStep: string
  totalSteps?: number
}

export interface StepEventData {
  stepType: 'tool_call' | 'file_read' | 'file_write' | 'shell_command' | 'text_delta'
  content: string
  toolName?: string
  filePath?: string
}

export interface ErrorEventData {
  error: string
  recoverable: boolean
  canRetry: boolean
}

export interface CompleteEventData {
  success: boolean
  summary: string
  filesChanged?: string[]
  duration: number
}

type EventListener = (event: AgentEvent) => void

class EventEmitter {
  private listeners: Set<EventListener> = new Set()

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(event: AgentEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event)
      } catch (error) {
        console.error('[EventEmitter] Error in event listener:', error)
      }
    })
  }

  get listenerCount(): number {
    return this.listeners.size
  }
}

// Global event emitter for agent work events
export const agentEvents = new EventEmitter()

/**
 * Helper to broadcast status events
 */
export function broadcastStatus(
  issueId: string,
  workId: string,
  status: StatusEventData['status'],
  message?: string
): void {
  agentEvents.emit({
    type: 'status',
    issueId,
    workId,
    timestamp: Date.now(),
    data: { status, message } satisfies StatusEventData,
  })
}

/**
 * Helper to broadcast progress events
 */
export function broadcastProgress(
  issueId: string,
  workId: string,
  percent: number,
  currentStep: string,
  totalSteps?: number
): void {
  agentEvents.emit({
    type: 'progress',
    issueId,
    workId,
    timestamp: Date.now(),
    data: { percent, currentStep, totalSteps } satisfies ProgressEventData,
  })
}

/**
 * Helper to broadcast step events
 */
export function broadcastStep(
  issueId: string,
  workId: string,
  stepType: StepEventData['stepType'],
  content: string,
  options?: { toolName?: string; filePath?: string }
): void {
  agentEvents.emit({
    type: 'step',
    issueId,
    workId,
    timestamp: Date.now(),
    data: { stepType, content, ...options } satisfies StepEventData,
  })
}

/**
 * Helper to broadcast error events
 */
export function broadcastError(
  issueId: string,
  workId: string,
  error: string,
  recoverable: boolean = false,
  canRetry: boolean = false
): void {
  agentEvents.emit({
    type: 'error',
    issueId,
    workId,
    timestamp: Date.now(),
    data: { error, recoverable, canRetry } satisfies ErrorEventData,
  })
}

/**
 * Helper to broadcast completion events
 */
export function broadcastComplete(
  issueId: string,
  workId: string,
  success: boolean,
  summary: string,
  duration: number,
  filesChanged?: string[]
): void {
  agentEvents.emit({
    type: 'complete',
    issueId,
    workId,
    timestamp: Date.now(),
    data: { success, summary, duration, filesChanged } satisfies CompleteEventData,
  })
}
