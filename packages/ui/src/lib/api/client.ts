/**
 * Client-side API functions that call the backend directly
 * These run in the browser and make HTTP requests to the backend server
 */

const API_BASE = process.env.BD_API_URL || 'http://localhost:3001/api/bd'
const WORK_API_BASE =
  process.env.WORK_API_URL || 'http://localhost:3001/api/work'
const PROJECTS_API_BASE =
  process.env.PROJECTS_API_URL || 'http://localhost:3001/api/projects'

// ============================================================================
// Project Management
// ============================================================================

/**
 * Check if a project has a .beads database initialized
 */
export async function checkProjectInitialized(projectPath?: string): Promise<{
  initialized: boolean
  path: string
}> {
  if (!projectPath || projectPath.trim() === '') {
    return { initialized: false, path: projectPath || '' }
  }

  const url = new URL(`${API_BASE}/check-initialized`, window.location.origin)
  url.searchParams.set('project_path', projectPath)

  const response = await fetch(url.toString())
  if (!response.ok) {
    throw new Error('Failed to check project status')
  }

  return response.json()
}

/**
 * Initialize a new beads database in a project directory
 */
export async function initProject(projectPath: string): Promise<any> {
  const url = new URL(`${API_BASE}/init`, window.location.origin)

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_path: projectPath }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: response.statusText,
    }))
    throw new Error(error.message || 'Failed to initialize project')
  }

  return response.json()
}

// ============================================================================
// Issues
// ============================================================================

/**
 * Helper function for API calls
 */
async function fetchFromAPI(
  endpoint: string,
  options?: RequestInit,
  projectPath?: string,
) {
  const url = new URL(`${API_BASE}${endpoint}`, window.location.origin)

  // Add project_path as query parameter if provided
  if (projectPath) {
    url.searchParams.set('project_path', projectPath)
  }

  const response = await fetch(url.toString(), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: response.statusText }))
    throw new Error(error.message || error.error || 'API request failed')
  }

  return response.json()
}

/**
 * Get all tasks with optional filters
 */
export async function getTasks(projectPath?: string) {
  return fetchFromAPI('/issues', undefined, projectPath)
}

/**
 * Create a new task
 */
export async function createTask(input: any, projectPath?: string) {
  return fetchFromAPI(
    '/issues',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    projectPath,
  )
}

/**
 * Update a task
 */
export async function updateTask(id: string, input: any, projectPath?: string) {
  return fetchFromAPI(
    `/issues/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
    projectPath,
  )
}

/**
 * Update task status
 */
export async function updateTaskStatus({
  id,
  status,
  projectPath,
}: {
  id: string
  status: string
  projectPath?: string
}) {
  return fetchFromAPI(
    `/issues/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
    projectPath,
  )
}

/**
 * Close a task
 */
export async function closeTask(id: string, projectPath?: string) {
  return fetchFromAPI(
    `/issues/${id}/close`,
    {
      method: 'POST',
    },
    projectPath,
  )
}

/**
 * Reopen a task
 */
export async function reopenTask(id: string, projectPath?: string) {
  return fetchFromAPI(
    `/issues/${id}/reopen`,
    {
      method: 'POST',
    },
    projectPath,
  )
}

/**
 * Delete a task
 */
export async function deleteTask(id: string, projectPath?: string) {
  return fetchFromAPI(
    `/issues/${id}`,
    {
      method: 'DELETE',
    },
    projectPath,
  )
}

// ============================================================================
// Comments
// ============================================================================

/**
 * Get subtasks for a parent task
 */
export async function getSubtasks(id: string, projectPath?: string) {
  return fetchFromAPI(`/issues/${id}/subtasks`, undefined, projectPath)
}

/**
 * Add a comment to a task
 */
export async function addComment(
  id: string,
  comment: string,
  projectPath?: string,
) {
  return fetchFromAPI(
    `/issues/${id}/comments`,
    {
      method: 'POST',
      body: JSON.stringify({ comment }),
    },
    projectPath,
  )
}

// ============================================================================
// Dependencies
// ============================================================================

/**
 * Add a dependency to a task
 */
export async function addDependency(
  id: string,
  dep: string,
  projectPath?: string,
) {
  return fetchFromAPI(
    `/issues/${id}/deps`,
    {
      method: 'POST',
      body: JSON.stringify({ dep }),
    },
    projectPath,
  )
}

/**
 * Remove a dependency from a task
 */
export async function removeDependency(
  id: string,
  depId: string,
  projectPath?: string,
) {
  return fetchFromAPI(
    `/issues/${id}/deps/${depId}`,
    {
      method: 'DELETE',
    },
    projectPath,
  )
}

// ============================================================================
// Queries & Search
// ============================================================================

/**
 * Get blocked tasks
 */
export async function getBlockedTasks(projectPath?: string) {
  return fetchFromAPI('/blocked', undefined, projectPath)
}

/**
 * Get ready tasks (no blockers)
 */
export async function getReadyTasks(projectPath?: string) {
  return fetchFromAPI('/ready', undefined, projectPath)
}

/**
 * Get stale tasks
 */
export async function getStaleTasks(projectPath?: string) {
  return fetchFromAPI('/stale', undefined, projectPath)
}

// ============================================================================
// Statistics & Info
// ============================================================================

/**
 * Get statistics
 */
export async function getStats(projectPath?: string) {
  return fetchFromAPI('/stats', undefined, projectPath)
}

/**
 * Get status overview
 */
export async function getStatusOverview(projectPath?: string) {
  return fetchFromAPI('/status', undefined, projectPath)
}

/**
 * Get database info
 */
export async function getDatabaseInfo(projectPath?: string) {
  return fetchFromAPI('/info', undefined, projectPath)
}

// ============================================================================
// Labels
// ============================================================================

/**
 * Get all labels
 */
export async function getLabels(projectPath?: string) {
  return fetchFromAPI('/labels', undefined, projectPath)
}

/**
 * Get all repositories/projects
 */
export async function getRepos(projectPath?: string) {
  return fetchFromAPI('/repos', undefined, projectPath)
}

// ============================================================================
// AI-powered task generation
// ============================================================================

/**
 * Generate a plan with subtasks for an issue using the pi-agent
 */
export async function generatePlan(issueId: string, projectPath?: string) {
  return fetchFromAPI(
    '/generate-plan',
    {
      method: 'POST',
      body: JSON.stringify({ issue_id: issueId, project_path: projectPath }),
    },
    undefined, // Don't add project_path as query param since it's in body
  )
}

/**
 * Generate subtasks and start work on an issue
 */
export async function startWorkWithSubtasks(input: {
  issue_id: string
  project_path?: string
  timeout?: number
}) {
  return fetchFromAPI(
    '/generate-and-start',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    undefined, // Don't add project_path as query param since it's in body
  )
}

/**
 * Generate title, description, and labels from a prompt using the pi-agent
 */
export async function generateTask(
  prompt: string,
  type?: 'bug' | 'feature' | 'task' | 'epic' | 'chore',
  projectPath?: string,
) {
  return fetchFromAPI(
    '/generate-task',
    {
      method: 'POST',
      body: JSON.stringify({ prompt, type }),
    },
    projectPath,
  )
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Cleanup closed tasks
 */
export async function cleanupClosedTasks(
  projectPath?: string,
  olderThanDays?: number,
) {
  return fetchFromAPI(
    '/cleanup',
    {
      method: 'POST',
      body: JSON.stringify({ older_than_days: olderThanDays }),
    },
    projectPath,
  )
}

// ============================================================================
// Projects API
// ============================================================================

/**
 * Helper function for projects API calls
 */
async function fetchFromProjectsAPI(endpoint: string, options?: RequestInit) {
  const url = new URL(
    endpoint ? `${PROJECTS_API_BASE}/${endpoint}` : PROJECTS_API_BASE,
    window.location.origin,
  )

  const response = await fetch(url.toString(), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: response.statusText }))
    throw new Error(
      error.message || error.error || 'Projects API request failed',
    )
  }

  return response.json()
}

/**
 * Get all projects
 */
export async function getProjectsFromAPI() {
  return fetchFromProjectsAPI('')
}

/**
 * Add a new project
 */
export async function addProjectToAPI(input: { name: string; path: string }) {
  return fetchFromProjectsAPI('', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/**
 * Update a project
 */
export async function updateProjectInAPI(
  id: string,
  updates: Partial<{ name: string; path: string }>,
) {
  return fetchFromProjectsAPI(id, {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
}

/**
 * Remove a project
 */
export async function removeProjectFromAPI(id: string) {
  return fetchFromProjectsAPI(id, {
    method: 'DELETE',
  })
}

// ============================================================================
// Agent Work Management
// ============================================================================

/**
 * Helper function for work API calls
 */
async function fetchFromWorkAPI(endpoint: string, options?: RequestInit) {
  const url = new URL(`${WORK_API_BASE}${endpoint}`, window.location.origin)

  const response = await fetch(url.toString(), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: response.statusText }))
    throw new Error(error.message || error.error || 'Work API request failed')
  }

  return response.json()
}

/**
 * Start agent work on an issue
 */
export async function startWork(input: {
  issue_id: string
  project_path?: string
  timeout?: number
}) {
  return fetchFromWorkAPI('/start', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/**
 * Get the status of work on an issue
 */
export async function getWorkStatus(issueId: string) {
  return fetchFromWorkAPI(`/status/${issueId}`)
}

/**
 * Get details of a specific work session
 */
export async function getWorkSession(workId: string) {
  return fetchFromWorkAPI(`/session/${workId}`)
}

/**
 * Get all active work sessions
 */
export async function getActiveWorkSessions() {
  return fetchFromWorkAPI('/active')
}

/**
 * Get all active work sessions (alias for consistency with naming)
 */
export async function getActiveWork() {
  return fetchFromWorkAPI('/active')
}

/**
 * Cancel active work on an issue
 */
export async function cancelWork(issueId: string) {
  return fetchFromWorkAPI(`/cancel/${issueId}`, {
    method: 'POST',
  })
}
