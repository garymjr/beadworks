import { createServerFn } from '@tanstack/react-start'
import type {
  CreateTaskInput,
  Task,
  UpdateTaskInput,
} from './types'

const API_BASE = process.env.BD_API_URL || 'http://localhost:3001/api/bd'

// ============================================================================
// Server Functions for Project Management
// ============================================================================

/**
 * Check if a project has a .beads database initialized
 */
export const checkProjectInitialized = createServerFn({
  method: 'GET',
})
  .inputValidator((projectPath?: string) => projectPath)
  .handler(async ({ data }) => {
    if (!data || data.trim() === '') {
      return { initialized: false, path: data || '' }
    }
    const url = new URL(`${API_BASE}/check-initialized`, 'http://localhost')
    url.searchParams.set('project_path', data)

    const response = await fetch(url.toString())
    if (!response.ok) {
      throw new Error('Failed to check project status')
    }

    return response.json() as Promise<{ initialized: boolean; path: string }>
  })

/**
 * Initialize a new beads database in a project directory
 */
export const initProject = createServerFn({
  method: 'POST',
})
  .inputValidator((projectPath: string) => projectPath)
  .handler(async ({ data }) => {
    const url = new URL(`${API_BASE}/init`, 'http://localhost')

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_path: data }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        message: response.statusText,
      }))
      throw new Error(error.message || 'Failed to initialize project')
    }

    return response.json()
  })

// Helper function for API calls
async function fetchFromAPI(
  endpoint: string,
  options?: RequestInit,
  projectPath?: string,
) {
  const url = new URL(`${API_BASE}${endpoint}`, 'http://localhost')

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

// ============================================================================
// Server Functions for Task Operations
// ============================================================================

/**
 * Get all tasks with optional filters
 */
export const getTasks = createServerFn({
  method: 'GET',
})
  .inputValidator((projectPath?: string) => projectPath)
  .handler(async ({ data }) => {
    const tasks = await fetchFromAPI('/issues', undefined, data)
    return tasks as Array<Task>
  })

/**
 * Get a single task by ID
 */
export const getTask = createServerFn({
  method: 'GET',
}).handler(async () => {
  // This would need the ID passed as query param - implement when needed
  throw new Error('Not implemented - use getTasks instead')
})

/**
 * Create a new task
 */
export const createTask = createServerFn({
  method: 'POST',
})
  .inputValidator(
    (data: { input: CreateTaskInput; projectPath?: string }) => data,
  )
  .handler(async ({ data: { input, projectPath } }) => {
    const task = await fetchFromAPI(
      '/issues',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
      projectPath,
    )
    return task as Task
  })

/**
 * Update a task
 */
export const updateTask = createServerFn({
  method: 'POST',
})
  .inputValidator(
    (data: { id: string; input: UpdateTaskInput; projectPath?: string }) =>
      data,
  )
  .handler(async ({ data: { id, input, projectPath } }) => {
    const task = await fetchFromAPI(
      `/issues/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      },
      projectPath,
    )
    return task as Task
  })

/**
 * Update task status
 */
export const updateTaskStatus = createServerFn({
  method: 'POST',
})
  .inputValidator(
    (data: { id: string; status: string; projectPath?: string }) => data,
  )
  .handler(async ({ data: { id, status, projectPath } }) => {
    const task = await fetchFromAPI(
      `/issues/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      },
      projectPath,
    )
    return task as Task
  })

/**
 * Close a task
 */
export const closeTask = createServerFn({
  method: 'POST',
})
  .inputValidator((data: { id: string; projectPath?: string }) => data)
  .handler(async ({ data }) => {
    const result = await fetchFromAPI(
      `/issues/${data.id}/close`,
      {
        method: 'POST',
      },
      data.projectPath,
    )
    return result as Task
  })

/**
 * Reopen a task
 */
export const reopenTask = createServerFn({
  method: 'POST',
})
  .inputValidator((data: { id: string; projectPath?: string }) => data)
  .handler(async ({ data }) => {
    const result = await fetchFromAPI(
      `/issues/${data.id}/reopen`,
      {
        method: 'POST',
      },
      data.projectPath,
    )
    return result as Task
  })

/**
 * Delete a task
 */
export const deleteTask = createServerFn({
  method: 'POST',
})
  .inputValidator((data: { id: string; projectPath?: string }) => data)
  .handler(async ({ data }) => {
    const result = await fetchFromAPI(
      `/issues/${data.id}`,
      {
        method: 'DELETE',
      },
      data.projectPath,
    )
    return result
  })

// ============================================================================
// Server Functions for Comments
// ============================================================================

/**
 * Get comments for a task
 */
export const getComments = createServerFn({
  method: 'GET',
}).handler(async () => {
  throw new Error('Not implemented')
})

/**
 * Add a comment to a task
 */
export const addComment = createServerFn({
  method: 'POST',
})
  .inputValidator(
    ({
      id,
      comment,
      projectPath,
    }: {
      id: string
      comment: string
      projectPath?: string
    }) => ({ id, comment, projectPath }),
  )
  .handler(async ({ data: { id, comment, projectPath } }) => {
    const result = await fetchFromAPI(
      `/issues/${id}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ comment }),
      },
      projectPath,
    )
    return result
  })

// ============================================================================
// Server Functions for Dependencies
// ============================================================================

/**
 * Add a dependency to a task
 */
export const addDependency = createServerFn({
  method: 'POST',
})
  .inputValidator(
    ({
      id,
      dep,
      projectPath,
    }: {
      id: string
      dep: string
      projectPath?: string
    }) => ({ id, dep, projectPath }),
  )
  .handler(async ({ data: { id, dep, projectPath } }) => {
    const result = await fetchFromAPI(
      `/issues/${id}/deps`,
      {
        method: 'POST',
        body: JSON.stringify({ dep }),
      },
      projectPath,
    )
    return result
  })

/**
 * Remove a dependency from a task
 */
export const removeDependency = createServerFn({
  method: 'POST',
})
  .inputValidator(
    ({
      id,
      depId,
      projectPath,
    }: {
      id: string
      depId: string
      projectPath?: string
    }) => ({ id, depId, projectPath }),
  )
  .handler(async ({ data: { id, depId, projectPath } }) => {
    const result = await fetchFromAPI(
      `/issues/${id}/deps/${depId}`,
      {
        method: 'DELETE',
      },
      projectPath,
    )
    return result
  })

// ============================================================================
// Server Functions for Queries & Search
// ============================================================================

/**
 * Search tasks
 */
export const searchTasks = createServerFn({
  method: 'GET',
}).handler(async () => {
  throw new Error('Not implemented')
})

/**
 * Get blocked tasks
 */
export const getBlockedTasks = createServerFn({
  method: 'GET',
})
  .inputValidator((projectPath?: string) => projectPath)
  .handler(async ({ data }) => {
    const tasks = await fetchFromAPI('/blocked', undefined, data)
    return tasks as Array<Task>
  })

/**
 * Get ready tasks (no blockers)
 */
export const getReadyTasks = createServerFn({
  method: 'GET',
})
  .inputValidator((projectPath?: string) => projectPath)
  .handler(async ({ data }) => {
    const tasks = await fetchFromAPI('/ready', undefined, data)
    return tasks as Array<Task>
  })

/**
 * Get stale tasks
 */
export const getStaleTasks = createServerFn({
  method: 'GET',
})
  .inputValidator((projectPath?: string) => projectPath)
  .handler(async ({ data }) => {
    const tasks = await fetchFromAPI('/stale', undefined, data)
    return tasks as Array<Task>
  })

// ============================================================================
// Server Functions for Statistics & Info
// ============================================================================

/**
 * Get statistics
 */
export const getStats = createServerFn({
  method: 'GET',
})
  .inputValidator((projectPath?: string) => projectPath)
  .handler(async ({ data }) => {
    const stats = await fetchFromAPI('/stats', undefined, data)
    return stats
  })

/**
 * Get status overview
 */
export const getStatusOverview = createServerFn({
  method: 'GET',
})
  .inputValidator((projectPath?: string) => projectPath)
  .handler(async ({ data }) => {
    const status = await fetchFromAPI('/status', undefined, data)
    return status
  })

/**
 * Get database info
 */
export const getDatabaseInfo = createServerFn({
  method: 'GET',
})
  .inputValidator((projectPath?: string) => projectPath)
  .handler(async ({ data }) => {
    const info = await fetchFromAPI('/info', undefined, data)
    return info
  })

// ============================================================================
// Server Functions for Labels
// ============================================================================

/**
 * Get all labels
 */
export const getLabels = createServerFn({
  method: 'GET',
})
  .inputValidator((projectPath?: string) => projectPath)
  .handler(async ({ data }) => {
    const labels = await fetchFromAPI('/labels', undefined, data)
    return labels
  })

/**
 * Get all repositories/projects
 */
export const getRepos = createServerFn({
  method: 'GET',
})
  .inputValidator((projectPath?: string) => projectPath)
  .handler(async ({ data }) => {
    const repos = await fetchFromAPI('/repos', undefined, data)
    return repos
  })
