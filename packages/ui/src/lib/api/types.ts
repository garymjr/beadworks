// Type definitions for Beadworks API

// ============================================================================
// Agent Work Event Types
// ============================================================================

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

// Connected event sent when SSE connection is established
export interface ConnectedAgentEvent {
  type: 'connected'
  timestamp: number
}

export type AgentEvent =
  | StatusAgentEvent
  | ProgressAgentEvent
  | StepAgentEvent
  | ErrorAgentEvent
  | CompleteAgentEvent
  | ConnectedAgentEvent

export interface StatusEventData {
  status:
    | 'starting'
    | 'thinking'
    | 'working'
    | 'complete'
    | 'error'
    | 'cancelled'
  message?: string
}

export interface ProgressEventData {
  percent: number
  currentStep: string
  totalSteps?: number
}

export interface StepEventData {
  stepType:
    | 'tool_call'
    | 'file_read'
    | 'file_write'
    | 'shell_command'
    | 'text_delta'
  content?: string
  toolName?: string
  filePath?: string
}

export interface ErrorEventData {
  error: string
  message?: string  // Alias for error, optional for compatibility
  recoverable: boolean
  canRetry: boolean
}

export interface CompleteEventData {
  success: boolean
  summary: string
  filesChanged: Array<string>
  duration: number
}

// ============================================================================
// Work Session Types
// ============================================================================

export interface WorkStatusResponse {
  workId: string
  issueId: string
  status: 'starting' | 'thinking' | 'working' | 'complete' | 'error' | 'cancelled'
  progress: number
  currentStep: string
  totalSteps?: number
  startTime: number
  endTime?: number
  error?: {
    message: string
    recoverable: boolean
    canRetry: boolean
  }
  result?: {
    success: boolean
    summary: string
    filesChanged: Array<string>
  }
}

export interface ActiveWorkSession {
  workId: string
  issueId: string
  status: 'starting' | 'thinking' | 'working' | 'complete' | 'error' | 'cancelled'
  progress: number
  currentStep: string
  startTime: number
}

export interface ActiveWorkSessionsResponse {
  sessions: Array<ActiveWorkSession>
  count: number
}

// ============================================================================
// Task Types
// ============================================================================

export interface Task {
  id: string
  title: string
  description?: string
  status: 'open' | 'blocked' | 'in_progress' | 'closed'
  issue_type?: 'bug' | 'feature' | 'task' | 'epic' | 'chore'
  priority?: number
  assignee?: string
  labels?: Array<string>
  estimate?: number
  acceptance?: string
  design?: string
  externalRef?: string
  parent?: string
  deps?: Array<string>
  created_at?: string
  updated_at?: string
  closed_at?: string
  dependency_count?: number
  dependent_count?: number
  // Subtask progress info (when this task is a parent)
  subtaskProgress?: {
    total: number
    completed: number
    percent: number
  }
}

export interface CreateTaskInput {
  title: string
  description?: string
  type?: 'bug' | 'feature' | 'task' | 'epic' | 'chore'
  priority?: string
  assignee?: string
  labels?: Array<string>
  estimate?: number
  acceptance?: string
  design?: string
  externalRef?: string
  parent?: string
  deps?: Array<string>
}

export interface UpdateTaskInput {
  title?: string
  description?: string
  type?: 'bug' | 'feature' | 'task' | 'epic' | 'chore'
  status?: string
  priority?: number
  assignee?: string
  addLabels?: Array<string>
  removeLabels?: Array<string>
  setLabels?: Array<string>
  estimate?: number
  acceptance?: string
  design?: string
  externalRef?: string
  notes?: string
}

// Response type for AI-generated task from a prompt
export interface GeneratedTaskResponse {
  title: string
  description?: string
  labels?: Array<string>
}

export interface TaskFilters {
  status?: string
  type?: string
  assignee?: string
  priority?: string
  labels?: Array<string>
  limit?: number
  sort?: string
  reverse?: boolean
}

export interface Stats {
  total_issues: number
  open_issues: number
  in_progress_issues: number
  closed_issues: number
  blocked_issues: number
  ready_issues: number
  tombstone_issues: number
  epics_eligible_for_closure: number
  average_lead_time_hours: number
}

export interface Comment {
  id: string
  author: string
  content: string
  timestamp: string
}

export interface Stats {
  total: number
  open: number
  blocked: number
  inProgress: number
  closed: number
  highPriority: number
}

// Mapping between UI columns and BD statuses
export const COLUMN_STATUS_MAP: Record<string, string> = {
  todo: 'open',
  blocked: 'blocked',
  ready: 'open',
  'in-progress': 'in_progress',
  done: 'closed',
} as const

export const STATUS_COLUMN_MAP: Record<string, string> = {
  open: 'todo',
  blocked: 'blocked',
  in_progress: 'in-progress',
  closed: 'done',
} as const

// ============================================================================
// Agent Pool Status Types
// ============================================================================

export type PlanningAgentStatus = 'active' | 'idle' | 'error'

export interface PlanningAgentInfo {
  status: PlanningAgentStatus
  currentIssueId?: string
  lastActivity: number
}

export interface WorkerInfo {
  id: string
  status: 'active' | 'idle' | 'error'
  currentIssueId?: string
  lastActivity: number
}

export interface WorkerPoolStatus {
  totalWorkers: number
  activeWorkers: number
  idleWorkers: number
  workers: Array<WorkerInfo>
}

export interface AgentPoolStatusResponse {
  planningAgent: PlanningAgentInfo
  workerPool: WorkerPoolStatus
}
