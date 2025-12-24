import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAgentEvents } from '../hooks/useAgentEvents'
import {
  cancelWork,
  checkProjectInitialized,
  cleanupClosedTasks,
  generatePlan,
  getSubtasks,
  getTasks,
  initProject,
  startWork,
  updateTask,
  updateTaskStatus,
} from '../lib/api/client'
import { COLUMN_STATUS_MAP, STATUS_COLUMN_MAP } from '../lib/api/types'
import { ProjectSelector } from '../components/ProjectSelector'
import { AddProjectModal } from '../components/AddProjectModal'
import { AddTaskModal } from '../components/AddTaskModal'
import { WorkProgressCard } from '../components/WorkProgressCard'
import { WorkProgressModal } from '../components/WorkProgressModal'
import { getCurrentProject, getProjects } from '../lib/projects'
import type { Task } from '../lib/api/types'
import type { Project } from '../lib/projects'

// Search params type for this route
interface IndexSearch {
  projectPath?: string
}

interface Column {
  id: string
  title: string
  tasks: Array<Task>
}

// Interface for tracking active work sessions
interface ActiveWorkSession {
  issueId: string
  issueTitle: string
  startedAt: number
}

// Bead colors for visual variety
const BEAD_COLORS = [
  '#ff6b6b',
  '#ffd93d',
  '#6bcb77',
  '#4d96ff',
  '#9b59b6',
  '#ff9ff3',
  '#ff9f43',
  '#54a0ff',
  '#5f27cd',
  '#00d2d3',
  '#1dd1a1',
  '#f368e0',
]

// Helper to get a consistent color for a task
function getBeadColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  return BEAD_COLORS[Math.abs(hash) % BEAD_COLORS.length]
}

// Helper to get priority from labels
function getPriorityFromLabels(
  labels?: Array<string>,
): 'low' | 'medium' | 'high' {
  if (!labels || labels.length === 0) return 'medium'

  const labelLower = labels.map((l) => l.toLowerCase())
  if (labelLower.some((l) => l.includes('critical') || l.includes('urgent')))
    return 'high'
  if (
    labelLower.some(
      (l) => l.includes('priority:high') || l.includes('high-priority'),
    )
  )
    return 'high'
  if (
    labelLower.some(
      (l) => l.includes('priority:low') || l.includes('low-priority'),
    )
  )
    return 'low'
  if (labelLower.some((l) => l.includes('priority:medium'))) return 'medium'

  return 'medium'
}

// Helper to detect if a task is a subtask
// Subtasks have IDs with a dot (e.g., "server-d98.6" is a subtask of "server-d98")
function isSubtask(task: Task): boolean {
  // Check if task has a parent field
  if (task.parent) return true

  // Check if ID contains a dot (bd's notation for subtasks)
  if (task.id.includes('.')) return true

  return false
}

// Helper to get parent task ID from a subtask ID
function getParentTaskId(subtaskId: string): string {
  // For IDs like "server-d98.6", return "server-d98"
  const dotIndex = subtaskId.lastIndexOf('.')
  if (dotIndex > 0) {
    return subtaskId.substring(0, dotIndex)
  }
  return subtaskId
}

// Stable empty array reference to avoid infinite re-renders
const EMPTY_TASKS: Array<Task> = []

// Wrapper component for WorkProgressCard that uses useAgentEvents hook
function WorkProgressCardWrapper({
  session,
  projectPath,
  onComplete,
  onError,
  onCancel,
  onDismiss,
  onClick,
}: {
  session: ActiveWorkSession
  projectPath?: string
  onComplete?: () => void
  onError?: () => void
  onCancel?: () => void
  onDismiss?: () => void
  onClick?: () => void
}) {
  const workState = useAgentEvents(session.issueId, true)

  return (
    <WorkProgressCard
      issueId={session.issueId}
      issueTitle={session.issueTitle}
      projectPath={projectPath}
      startedAt={session.startedAt}
      onComplete={onComplete}
      onError={onError}
      onCancel={onCancel}
      onDismiss={onDismiss}
      onClick={onClick}
      workState={workState}
    />
  )
}

// Wrapper component for WorkProgressModal that uses useAgentEvents hook
function WorkProgressModalWrapper({
  session,
  onClose,
}: {
  session: ActiveWorkSession
  onClose: () => void
}) {
  const workState = useAgentEvents(session.issueId, true)

  return (
    <WorkProgressModal
      isOpen={true}
      onClose={onClose}
      issueId={session.issueId}
      issueTitle={session.issueTitle}
      workState={workState}
      startedAt={session.startedAt}
    />
  )
}

export const Route = createFileRoute('/')({
  component: BeadworksKanban,
  validateSearch: (search: Record<string, unknown>) => ({
    projectPath:
      typeof search.projectPath === 'string' ? search.projectPath : undefined,
  }),
})

function BeadworksKanban() {
  const router = useRouter()
  const search = Route.useSearch()
  const queryClient = useQueryClient()

  // First check if project is initialized, then fetch tasks
  const { data: initStatus } = useQuery({
    queryKey: ['initStatus', search.projectPath],
    queryFn: () => checkProjectInitialized(search.projectPath),
    enabled: !!search.projectPath,
    retry: false,
  })

  const {
    data: tasks = EMPTY_TASKS,
    error,
    isLoading,
  } = useQuery({
    queryKey: ['tasks', search.projectPath],
    queryFn: () => getTasks(search.projectPath || ''),
    enabled: !!search.projectPath && !!initStatus?.initialized,
    retry: false,
  })

  console.log('Render state:', {
    projectPath: search.projectPath,
    initialized: initStatus?.initialized,
    tasksCount: tasks.length,
    isLoading,
    error,
  })

  // Base column definitions
  const baseColumns: Array<Column> = [
    { id: 'todo', title: 'Todo', tasks: [] },
    { id: 'blocked', title: 'Blocked', tasks: [] },
    { id: 'ready', title: 'Ready', tasks: [] },
    { id: 'in-progress', title: 'In Progress', tasks: [] },
    { id: 'done', title: 'Done', tasks: [] },
  ]

  const [columns, setColumns] = useState<Array<Column>>(baseColumns)
  const prevTasksRef = useRef<Array<Task>>(EMPTY_TASKS)

  // Fetch subtask progress for all parent tasks
  useEffect(() => {
    tasks.forEach(async (task) => {
      // Only fetch for parent tasks (not subtasks)
      if (!isSubtask(task)) {
        try {
          const result = await getSubtasks(task.id, search.projectPath)
          // Only store progress if there are subtasks
          if (result.subtasks && result.subtasks.length > 0) {
            setSubtaskProgress((prev) => ({
              ...prev,
              [task.id]: result.progress,
            }))
          }
        } catch (e) {
          // Silently fail - not all tasks have subtasks
          console.debug('No subtasks for task:', task.id)
        }
      }
    })
  }, [tasks, search.projectPath])

  // Organize tasks into columns - only update if tasks actually changed
  useEffect(() => {
    // Only update if the tasks reference actually changed (not just a new empty array)
    if (tasks === prevTasksRef.current) return

    prevTasksRef.current = tasks

    setColumns((prev) => {
      const newCols = prev.map((col) => ({ ...col, tasks: [] }))

      tasks.forEach((task) => {
        // Filter out subtasks - they shouldn't show on main board
        // Subtasks are detected by having a parent field OR a dot in their ID
        if (isSubtask(task)) return

        // Determine the column for this task
        let columnId = STATUS_COLUMN_MAP[task.status] || 'todo'

        // Special case: open tasks with ai-plan-generated label go to ready column
        if (
          task.status === 'open' &&
          task.labels?.includes('ai-plan-generated')
        ) {
          columnId = 'ready'
        }

        const colIndex = newCols.findIndex((c) => c.id === columnId)
        if (colIndex !== -1) {
          newCols[colIndex].tasks.push(task)
        }
      })

      return newCols
    })
  }, [tasks])

  const [draggedTask, setDraggedTask] = useState<Task | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState<string | null>(null)
  const [isGeneratingPlan, setIsGeneratingPlan] = useState<string | null>(null)
  const [showAddProjectModal, setShowAddProjectModal] = useState(false)
  const [showAddTaskModal, setShowAddTaskModal] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const [isCleaningUp, setIsCleaningUp] = useState(false)
  const [subtaskProgress, setSubtaskProgress] = useState<
    Record<string, { total: number; completed: number; percent: number }>
  >({})
  // Track multiple active work sessions
  const [activeWorkSessions, setActiveWorkSessions] = useState<
    Map<string, ActiveWorkSession>
  >(new Map())
  const [startingWork, setStartingWork] = useState<string | null>(null)
  // Modal state for detailed view
  const [modalSessionId, setModalSessionId] = useState<string | null>(null)

  // Get the session for modal
  const modalSession = modalSessionId
    ? activeWorkSessions.get(modalSessionId)
    : null

  // Track current project - initialize safely for SSR
  const [currentProject, setCurrentProject] = useState<Project | null>(null)
  const [hasMigrated, setHasMigrated] = useState(false)

  // Load current project from localStorage on mount and sync URL
  // Also handle migration from localStorage to API
  useEffect(() => {
    async function loadProjectAndMigrate() {
      // First, check if we need to migrate legacy projects
      if (!hasMigrated) {
        const { hasLegacyProjects, migrateProjectsFromLocalStorage } = await import('../lib/projects')
        if (hasLegacyProjects()) {
          try {
            const migrated = await migrateProjectsFromLocalStorage()
            if (migrated > 0) {
              console.log(`Migrated ${migrated} projects from localStorage to API`)
            }
          } catch (error) {
            console.error('Failed to migrate projects:', error)
          }
        }
        setHasMigrated(true)
      }

      // Then load the current project
      const project = await getCurrentProject()
      setCurrentProject(project)

      // Sync URL with current project if not already set
      if (project?.path && !search.projectPath) {
        router.navigate({
          to: '/',
          search: { projectPath: project.path },
        })
      }
    }

    loadProjectAndMigrate()
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Handle project changes - update URL and refetch
  const handleProjectChange = useCallback(
    (project: Project | null) => {
      setCurrentProject(project)

      // Use router navigate to update search params and trigger loader
      router.navigate({
        to: '/',
        search: project?.path ? { projectPath: project.path } : {},
      })
    },
    [router],
  )

  // Handle when a project is added via the modal
  const handleProjectAdded = useCallback(
    (project: Project) => {
      setCurrentProject(project)

      // Use router navigate to update search params and trigger loader
      router.navigate({
        to: '/',
        search: { projectPath: project.path },
      })
    },
    [router],
  )

  const handleDragStart = (task: Task) => {
    setDraggedTask(task)
  }

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault()
    setDragOverColumn(columnId)
  }

  const handleDragLeave = () => {
    setDragOverColumn(null)
  }

  const handleDrop = async (e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault()

    if (!draggedTask) return

    const newStatus = COLUMN_STATUS_MAP[targetColumnId]
    if (!newStatus) return

    // Check if this is a move to "ready" for a task without a plan yet
    const needsPlanGeneration =
      targetColumnId === 'ready' &&
      !draggedTask.labels?.includes('ai-plan-generated')

    // Optimistically update UI
    setColumns((prev) => {
      return prev.map((col) => {
        if (col.id === targetColumnId) {
          // Check if task already exists in this column
          if (col.tasks.find((t) => t.id === draggedTask.id)) {
            return col
          }
          return {
            ...col,
            tasks: [...col.tasks, draggedTask],
          }
        } else {
          return {
            ...col,
            tasks: col.tasks.filter((t) => t.id !== draggedTask.id),
          }
        }
      })
    })

    setDraggedTask(null)
    setDragOverColumn(null)

    // Update backend
    try {
      setIsUpdating(draggedTask.id)

      // Update the status first
      await updateTaskStatus({
        id: draggedTask.id,
        status: newStatus,
        projectPath: currentProject?.path,
      })

      // Generate the plan BEFORE adding the label (to avoid race condition)
      if (needsPlanGeneration) {
        try {
          setIsGeneratingPlan(draggedTask.id)
          console.log('Generating plan for task:', draggedTask.id)
          await generatePlan(draggedTask.id, currentProject?.path)
        } catch (planError) {
          console.error('Failed to generate plan:', planError)
          // Don't fail the status update if plan generation fails
        } finally {
          setIsGeneratingPlan(null)
        }
      }

      // Invalidate loader to refresh data
      router.invalidate()
    } catch (error) {
      console.error('Failed to update task status:', error)
      // Revert on error by invalidating
      router.invalidate()
    } finally {
      setIsUpdating(null)
    }
  }

  const handleDragEnd = () => {
    setDraggedTask(null)
    setDragOverColumn(null)
  }

  const handleStartWork = async (taskId: string) => {
    setStartingWork(taskId)
    try {
      const result = await startWork({
        issue_id: taskId,
        project_path: currentProject?.path,
      })
      if (result.success) {
        // Find the task title from columns
        const task = columns.flatMap((col) => col.tasks).find((t) => t.id === taskId)
        const newSession: ActiveWorkSession = {
          issueId: taskId,
          issueTitle: task?.title || 'Unknown Issue',
          startedAt: Date.now(),
        }
        // Add new session without removing existing ones
        setActiveWorkSessions((prev) => new Map(prev).set(taskId, newSession))
      }
    } catch (error) {
      console.error('Failed to start work:', error)
    } finally {
      setStartingWork(null)
    }
  }

  const handleWorkComplete = (taskId: string) => {
    setActiveWorkSessions((prev) => {
      const next = new Map(prev)
      next.delete(taskId)
      return next
    })
    router.invalidate()
  }

  const handleWorkError = (taskId: string) => {
    setActiveWorkSessions((prev) => {
      const next = new Map(prev)
      next.delete(taskId)
      return next
    })
    router.invalidate()
  }

  const handleWorkCancel = (taskId: string) => {
    setActiveWorkSessions((prev) => {
      const next = new Map(prev)
      next.delete(taskId)
      return next
    })
    router.invalidate()
  }

  const getPriorityGlow = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'shadow-[0_0_30px_rgba(255,107,107,0.4)]'
      case 'medium':
        return 'shadow-[0_0_30px_rgba(255,217,61,0.4)]'
      case 'low':
        return 'shadow-[0_0_30px_rgba(107,203,119,0.4)]'
      default:
        return ''
    }
  }

  const handleInitProject = async () => {
    if (!currentProject?.path) return

    setIsInitializing(true)
    setInitError(null)

    try {
      await initProject(currentProject.path)
      // Reload the page to fetch tasks
      router.invalidate()
    } catch (error) {
      setInitError(
        error instanceof Error ? error.message : 'Failed to initialize project',
      )
    } finally {
      setIsInitializing(false)
    }
  }

  const handleCleanup = async () => {
    if (!currentProject?.path) return

    setIsCleaningUp(true)

    try {
      await cleanupClosedTasks(currentProject.path)
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['tasks', search.projectPath] })
    } catch (error) {
      console.error('Failed to cleanup closed tasks:', error)
    } finally {
      setIsCleaningUp(false)
    }
  }

  // Show "no project selected" state
  if (!currentProject) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 overflow-hidden">
        {/* Animated background */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),transparent)]" />
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
        </div>

        {/* Header */}
        <header className="relative z-10 border-b border-white/5 backdrop-blur-sm">
          <div className="max-w-[1800px] mx-auto px-6 py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                    <svg
                      className="w-6 h-6 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <circle cx="12" cy="12" r="3" strokeWidth="2" />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"
                      />
                    </svg>
                  </div>
                </div>
                <div>
                  <h1
                    className="text-2xl font-bold text-white tracking-tight"
                    style={{ fontFamily: 'Outfit, sans-serif' }}
                  >
                    Beadworks
                  </h1>
                  <p className="text-sm text-slate-400">
                    Select a project to get started
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <ProjectSelector
                  onProjectChange={handleProjectChange}
                  onAddProjectClick={() => setShowAddProjectModal(true)}
                />
              </div>
            </div>
          </div>
        </header>

        {/* Empty State */}
        <main className="relative z-10 flex items-center justify-center min-h-[calc(100vh-88px)]">
          <div className="text-center max-w-lg mx-auto px-6">
            {/* Bead illustration */}
            <div className="mb-8 flex justify-center gap-3">
              <div
                className="w-16 h-16 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle at 30% 30%, #ff6b6bdd, #ff6b6b88)',
                  boxShadow:
                    '0 8px 32px #ff6b6b40, inset 0 1px 0 rgba(255,255,255,0.3)',
                }}
              />
              <div
                className="w-16 h-16 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle at 30% 30%, #ffd93ddd, #ffd93d88)',
                  boxShadow:
                    '0 8px 32px #ffd93d40, inset 0 1px 0 rgba(255,255,255,0.3)',
                }}
              />
              <div
                className="w-16 h-16 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle at 30% 30%, #6bcb77dd, #6bcb7788)',
                  boxShadow:
                    '0 8px 32px #6bcb7740, inset 0 1px 0 rgba(255,255,255,0.3)',
                }}
              />
            </div>

            <h2
              className="text-3xl font-bold text-white mb-4"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              No Project Selected
            </h2>
            <p className="text-lg text-slate-400 mb-8 leading-relaxed">
              Select a project from the dropdown above to view and manage your
              tasks. Each project has its own kanban board and task history.
            </p>

            {/* Hint */}
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-left">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-violet-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <h3
                    className="text-sm font-semibold text-white mb-1"
                    style={{ fontFamily: 'Outfit, sans-serif' }}
                  >
                    Getting Started
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Click the project selector above to add a new project. Your
                    project directory should contain a{' '}
                    <code className="px-1.5 py-0.5 rounded bg-white/5 text-violet-400">
                      .beads
                    </code>{' '}
                    folder initialized with{' '}
                    <code className="px-1.5 py-0.5 rounded bg-white/5 text-violet-400">
                      bd init
                    </code>
                    .
                  </p>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="fixed bottom-0 left-0 right-0 z-20 border-t border-white/5 bg-slate-950/80 backdrop-blur-sm">
          <div className="max-w-[1800px] mx-auto px-6 py-3">
            <div
              className="flex items-center justify-between text-xs"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            >
              <div className="flex items-center gap-6">
                <span className="text-slate-500">
                  <span className="text-violet-400">●</span> System Active
                </span>
              </div>
              <div className="flex items-center gap-2 text-slate-500">
                <span>Press</span>
                <kbd className="px-2 py-1 rounded bg-white/5 text-slate-400">
                  ?
                </kbd>
                <span>for keyboard shortcuts</span>
              </div>
            </div>
          </div>
        </footer>

        {/* Add Project Modal */}
        <AddProjectModal
          isOpen={showAddProjectModal}
          onClose={() => setShowAddProjectModal(false)}
          onProjectAdded={handleProjectAdded}
        />

        {/* Add Task Modal */}
        <AddTaskModal
          isOpen={showAddTaskModal}
          onClose={() => setShowAddTaskModal(false)}
          onTaskCreated={() =>
            queryClient.invalidateQueries({
              queryKey: ['tasks', search.projectPath],
            })
          }
          projectPath={currentProject?.path}
        />

        {/* Custom font imports */}
        <style>
          @import
          url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        </style>
      </div>
    )
  }

  // Show "project not initialized" state when project exists but isn't initialized
  // or when there's an error fetching tasks
  const needsInit = initStatus !== undefined && !initStatus.initialized
  if (needsInit || error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 overflow-hidden">
        {/* Animated background */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),transparent)]" />
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
        </div>

        {/* Header */}
        <header className="relative z-10 border-b border-white/5 backdrop-blur-sm">
          <div className="max-w-[1800px] mx-auto px-6 py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                    <svg
                      className="w-6 h-6 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <circle cx="12" cy="12" r="3" strokeWidth="2" />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"
                      />
                    </svg>
                  </div>
                </div>
                <div>
                  <h1
                    className="text-2xl font-bold text-white tracking-tight"
                    style={{ fontFamily: 'Outfit, sans-serif' }}
                  >
                    Beadworks
                  </h1>
                  <p className="text-sm text-slate-400">
                    {currentProject?.name || 'Select a project'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <ProjectSelector
                  onProjectChange={handleProjectChange}
                  onAddProjectClick={() => setShowAddProjectModal(true)}
                />
              </div>
            </div>
          </div>
        </header>

        {/* Needs Init State */}
        <main className="relative z-10 flex items-center justify-center min-h-[calc(100vh-88px)]">
          <div className="text-center max-w-lg mx-auto px-6">
            {/* Bead illustration */}
            <div className="mb-8 flex justify-center gap-3">
              <div
                className="w-16 h-16 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle at 30% 30%, #ff6b6bdd, #ff6b6b88)',
                  boxShadow:
                    '0 8px 32px #ff6b6b40, inset 0 1px 0 rgba(255,255,255,0.3)',
                }}
              />
              <div
                className="w-16 h-16 rounded-full animate-pulse"
                style={{
                  background:
                    'radial-gradient(circle at 30% 30%, #ffd93ddd, #ffd93d88)',
                  boxShadow:
                    '0 8px 32px #ffd93d40, inset 0 1px 0 rgba(255,255,255,0.3)',
                }}
              />
              <div
                className="w-16 h-16 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle at 30% 30%, #6bcb77dd, #6bcb7788)',
                  boxShadow:
                    '0 8px 32px #6bcb7740, inset 0 1px 0 rgba(255,255,255,0.3)',
                }}
              />
            </div>

            <h2
              className="text-3xl font-bold text-white mb-4"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              Project Not Initialized
            </h2>
            <p className="text-lg text-slate-400 mb-8 leading-relaxed">
              This project doesn't have a{' '}
              <code className="text-violet-400">.beads</code> database yet.
              Initialize it to start tracking tasks and issues.
            </p>

            {/* Info Box */}
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-left mb-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-violet-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <h3
                    className="text-sm font-semibold text-white mb-1"
                    style={{ fontFamily: 'Outfit, sans-serif' }}
                  >
                    What happens when you initialize?
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    A{' '}
                    <code className="px-1.5 py-0.5 rounded bg-white/5 text-violet-400">
                      .beads
                    </code>{' '}
                    folder will be created in{' '}
                    <code className="px-1.5 py-0.5 rounded bg-white/5 text-violet-400">
                      {currentProject?.path || 'your project directory'}
                    </code>{' '}
                    with a local database to track your issues.
                  </p>
                </div>
              </div>
            </div>

            {/* Error message */}
            {initError && (
              <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-left">
                <p className="text-sm text-red-400">{initError}</p>
              </div>
            )}

            {/* Initialize Button */}
            <button
              onClick={handleInitProject}
              disabled={isInitializing}
              className="px-8 py-4 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-semibold hover:shadow-lg hover:shadow-violet-500/25 transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              {isInitializing ? (
                <span className="flex items-center gap-3">
                  <svg
                    className="w-5 h-5 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Initializing...
                </span>
              ) : (
                'Initialize Project'
              )}
            </button>

            <p className="text-sm text-slate-500 mt-6">
              Or run{' '}
              <code className="px-1.5 py-0.5 rounded bg-white/5 text-violet-400">
                bd init
              </code>{' '}
              in your terminal
            </p>
          </div>
        </main>

        {/* Footer */}
        <footer className="fixed bottom-0 left-0 right-0 z-20 border-t border-white/5 bg-slate-950/80 backdrop-blur-sm">
          <div className="max-w-[1800px] mx-auto px-6 py-3">
            <div
              className="flex items-center justify-between text-xs"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            >
              <div className="flex items-center gap-6">
                <span className="text-slate-500">
                  <span className={error ? 'text-red-400' : 'text-amber-400'}>
                    ●
                  </span>{' '}
                  {error ? 'Error Loading Project' : 'Needs Initialization'}
                </span>
                {error && <span className="text-red-400">{error.message}</span>}
              </div>
              <div className="flex items-center gap-2 text-slate-500">
                <span>Press</span>
                <kbd className="px-2 py-1 rounded bg-white/5 text-slate-400">
                  ?
                </kbd>
                <span>for keyboard shortcuts</span>
              </div>
            </div>
          </div>
        </footer>

        {/* Add Project Modal */}
        <AddProjectModal
          isOpen={showAddProjectModal}
          onClose={() => setShowAddProjectModal(false)}
          onProjectAdded={handleProjectAdded}
        />

        {/* Add Task Modal */}
        <AddTaskModal
          isOpen={showAddTaskModal}
          onClose={() => setShowAddTaskModal(false)}
          onTaskCreated={() =>
            queryClient.invalidateQueries({
              queryKey: ['tasks', search.projectPath],
            })
          }
          projectPath={currentProject?.path}
        />

        {/* Custom font imports */}
        <style>
          @import
          url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        </style>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 overflow-hidden">
      {/* Animated background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),transparent)]" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/5 backdrop-blur-sm">
        <div className="max-w-[1800px] mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                  <svg
                    className="w-6 h-6 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <circle cx="12" cy="12" r="3" strokeWidth="2" />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"
                    />
                  </svg>
                </div>
                <div
                  className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900 ${error ? 'bg-red-400' : 'bg-emerald-400'}`}
                />
              </div>
              <div>
                <h1
                  className="text-2xl font-bold text-white tracking-tight"
                  style={{ fontFamily: 'Outfit, sans-serif' }}
                >
                  Beadworks
                </h1>
                <p className="text-sm text-slate-400">
                  {error ? 'Connection Error' : 'Connected to Beadworks'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Project Selector */}
              <ProjectSelector
                onProjectChange={handleProjectChange}
                onAddProjectClick={() => setShowAddProjectModal(true)}
              />

              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10">
                <div
                  className={`w-2 h-2 rounded-full ${error ? 'bg-red-400' : 'bg-emerald-400 animate-pulse'}`}
                />
                <span
                  className="text-sm text-slate-300"
                  style={{ fontFamily: 'JetBrains Mono, monospace' }}
                >
                  {columns.reduce((acc, col) => acc + col.tasks.length, 0)}{' '}
                  tasks loaded
                </span>
              </div>
              <button
                onClick={() => setShowAddTaskModal(true)}
                className="px-5 py-2.5 rounded-full bg-gradient-to-r from-violet-600 to-purple-600 text-white text-sm font-medium hover:shadow-lg hover:shadow-purple-500/25 transition-all duration-300 hover:scale-105"
              >
                + New Task
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Agent Work Progress Cards (Multiple) */}
      {activeWorkSessions.size > 0 && (
        <main className="relative z-10 px-6 pt-4">
          <div className="max-w-[1800px] mx-auto space-y-3">
            {Array.from(activeWorkSessions.values()).map((session) => (
              <WorkProgressCardWrapper
                key={session.issueId}
                session={session}
                projectPath={currentProject?.path}
                onComplete={() => handleWorkComplete(session.issueId)}
                onError={() => handleWorkError(session.issueId)}
                onCancel={() => handleWorkCancel(session.issueId)}
                onDismiss={() => handleWorkComplete(session.issueId)}
                onClick={() => setModalSessionId(session.issueId)}
              />
            ))}
          </div>
        </main>
      )}

      {/* Main Board */}
      <main className="relative z-10 p-6">
        <div className="max-w-[1800px] mx-auto">
          {/* Column Headers with Wire Metaphor */}
          <div className="flex gap-6 mb-8">
            {columns.map((column) => (
              <div
                key={column.id}
                className="flex-1 min-w-[280px] max-w-[340px]"
              >
                <div className="relative">
                  {/* Wire connector */}
                  <svg
                    className="absolute -top-8 left-1/2 -translate-x-1/2 w-12 h-16 pointer-events-none"
                    style={{ overflow: 'visible' }}
                  >
                    <line
                      x1="24"
                      y1="-20"
                      x2="24"
                      y2="0"
                      stroke="rgba(255,255,255,0.15)"
                      strokeWidth="2"
                      strokeDasharray="4 4"
                    />
                    <circle
                      cx="24"
                      cy="-20"
                      r="4"
                      fill="rgba(255,255,255,0.2)"
                    />
                  </svg>

                  {/* Column header */}
                  <div className="flex items-center justify-between mb-4 px-2">
                    <div className="flex items-center gap-2">
                      <h2
                        className="text-lg font-semibold text-white/90"
                        style={{ fontFamily: 'Outfit, sans-serif' }}
                      >
                        {column.title}
                      </h2>
                      {column.id === 'done' && column.tasks.length > 0 && (
                        <button
                          onClick={handleCleanup}
                          disabled={isCleaningUp}
                          className="px-2 py-1 rounded-md bg-red-500/10 border border-red-500/20 text-xs font-medium text-red-400 hover:bg-red-500/20 hover:border-red-500/30 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Delete all closed tasks"
                        >
                          {isCleaningUp ? (
                            <span className="flex items-center gap-1">
                              <svg
                                className="w-3 h-3 animate-spin"
                                fill="none"
                                viewBox="0 0 24 24"
                              >
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                />
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                              </svg>
                              Cleaning...
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <svg
                                className="w-3 h-3"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                              Cleanup
                            </span>
                          )}
                        </button>
                      )}
                    </div>
                    <span
                      className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-xs font-medium text-white/70"
                      style={{ fontFamily: 'JetBrains Mono, monospace' }}
                    >
                      {column.tasks.length}
                    </span>
                  </div>

                  {/* Bead track */}
                  <div
                    className={`relative min-h-[500px] p-4 rounded-2xl border-2 transition-all duration-300 ${
                      dragOverColumn === column.id
                        ? 'bg-white/5 border-violet-500/50 shadow-lg shadow-violet-500/10'
                        : 'bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.03]'
                    }`}
                    onDragOver={(e) => handleDragOver(e, column.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, column.id)}
                  >
                    {/* Track line */}
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent -translate-x-1/2 pointer-events-none" />

                    {/* Tasks */}
                    <div className="relative space-y-3">
                      {column.tasks.map((task) => {
                        const priority = getPriorityFromLabels(task.labels)
                        const beadColor = getBeadColor(task.id)

                        return (
                          <div
                            key={task.id}
                            draggable
                            onDragStart={() => handleDragStart(task)}
                            onDragEnd={handleDragEnd}
                            className={`group relative cursor-grab active:cursor-grabbing transition-all duration-300 ${
                              draggedTask?.id === task.id ||
                              isUpdating === task.id
                                ? 'opacity-50 scale-95'
                                : 'hover:scale-[1.02]'
                            }`}
                          >
                            {/* Glow effect */}
                            <div
                              className="absolute -inset-1 rounded-2xl opacity-0 group-hover:opacity-20 blur-lg transition-opacity duration-300"
                              style={{ background: beadColor }}
                            />

                            {/* Bead task card */}
                            <div
                              className={`relative bg-slate-900/80 backdrop-blur-sm rounded-xl border border-white/10 p-4 shadow-xl ${getPriorityGlow(priority)} transition-shadow duration-300`}
                            >
                              {/* Bead indicator */}
                              <div className="absolute -top-3 left-6">
                                <div
                                  className="w-8 h-8 rounded-full shadow-lg"
                                  style={{
                                    background: `radial-gradient(circle at 30% 30%, ${beadColor}dd, ${beadColor}88)`,
                                    boxShadow: `0 4px 12px ${beadColor}40, inset 0 1px 0 rgba(255,255,255,0.3)`,
                                  }}
                                />
                              </div>

                              {/* Task content */}
                              <div className="mt-3">
                                <h3
                                  className="text-white font-medium mb-2"
                                  style={{ fontFamily: 'Outfit, sans-serif' }}
                                >
                                  {task.title}
                                </h3>

                                {task.description && (
                                  <p className="text-sm text-slate-400 leading-relaxed mb-3 line-clamp-2">
                                    {task.description}
                                  </p>
                                )}

                                {/* Start Work Button (only in ready column) */}
                                {column.id === 'ready' && (
                                  <button
                                    onClick={() => handleStartWork(task.id)}
                                    disabled={startingWork === task.id}
                                    className="w-full mb-3 px-3 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 text-white text-sm font-medium hover:shadow-lg hover:shadow-violet-500/25 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                  >
                                    {startingWork === task.id ? (
                                      <>
                                        <svg
                                          className="w-4 h-4 animate-spin"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                        >
                                          <circle
                                            className="opacity-25"
                                            cx="12"
                                            cy="12"
                                            r="10"
                                            stroke="currentColor"
                                            strokeWidth="4"
                                          />
                                          <path
                                            className="opacity-75"
                                            fill="currentColor"
                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                          />
                                        </svg>
                                        Starting...
                                      </>
                                    ) : (
                                      <>
                                        <svg
                                          className="w-4 h-4"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                                          />
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                          />
                                        </svg>
                                        Start Work
                                      </>
                                    )}
                                  </button>
                                )}

                                {/* Tags */}
                                {task.labels && task.labels.length > 0 && (
                                  <div className="flex flex-wrap gap-2 mb-3">
                                    {task.labels.slice(0, 3).map((label) => (
                                      <span
                                        key={label}
                                        className="px-2 py-1 rounded-md text-xs font-medium bg-white/5 text-slate-300 border border-white/10"
                                        style={{
                                          fontFamily:
                                            'JetBrains Mono, monospace',
                                        }}
                                      >
                                        #{label}
                                      </span>
                                    ))}
                                    {task.labels.length > 3 && (
                                      <span className="px-2 py-1 rounded-md text-xs font-medium bg-white/5 text-slate-400 border border-white/10">
                                        +{task.labels.length - 3}
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* Priority indicator */}
                                <div className="flex items-center gap-2">
                                  <div
                                    className={`w-2 h-2 rounded-full ${
                                      priority === 'high'
                                        ? 'bg-red-400'
                                        : priority === 'medium'
                                          ? 'bg-yellow-400'
                                          : 'bg-emerald-400'
                                    }`}
                                  />
                                  <span className="text-xs text-slate-500 capitalize">
                                    {priority} priority
                                  </span>
                                  {task.issue_type && (
                                    <>
                                      <span className="text-slate-600">•</span>
                                      <span className="text-xs text-slate-500 capitalize">
                                        {task.issue_type}
                                      </span>
                                    </>
                                  )}

                                  {/* Plan generation indicator */}
                                  {isGeneratingPlan === task.id && (
                                    <>
                                      <span className="text-slate-600">•</span>
                                      <span className="text-xs text-violet-400 flex items-center gap-1">
                                        <svg
                                          className="w-3 h-3 animate-spin"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                        >
                                          <circle
                                            className="opacity-25"
                                            cx="12"
                                            cy="12"
                                            r="10"
                                            stroke="currentColor"
                                            strokeWidth="4"
                                          />
                                          <path
                                            className="opacity-75"
                                            fill="currentColor"
                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                          />
                                        </svg>
                                        Generating plan
                                      </span>
                                    </>
                                  )}
                                </div>

                                {/* Subtask progress bar */}
                                {subtaskProgress[task.id] &&
                                  subtaskProgress[task.id].total > 0 && (
                                    <div className="mt-3 pt-3 border-t border-white/5">
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs text-slate-400">
                                          Subtasks
                                        </span>
                                        <span className="text-xs text-slate-400">
                                          {subtaskProgress[task.id].completed} /{' '}
                                          {subtaskProgress[task.id].total}
                                        </span>
                                      </div>
                                      <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                          className="absolute inset-y-0 left-0 bg-gradient-to-r from-violet-500 to-purple-500 rounded-full transition-all duration-500 ease-out"
                                          style={{
                                            width: `${subtaskProgress[task.id].percent}%`,
                                          }}
                                        />
                                      </div>
                                      {subtaskProgress[task.id].percent ===
                                        100 && (
                                        <div className="flex items-center gap-1 mt-1.5">
                                          <svg
                                            className="w-3 h-3 text-emerald-400"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              strokeWidth={2}
                                              d="M5 13l4 4L19 7"
                                            />
                                          </svg>
                                          <span className="text-xs text-emerald-400">
                                            All subtasks completed
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                              </div>
                            </div>
                          </div>
                        )
                      })}

                      {column.tasks.length === 0 && (
                        <div className="py-16 text-center">
                          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                            <svg
                              className="w-8 h-8 text-white/20"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <circle
                                cx="12"
                                cy="12"
                                r="10"
                                strokeWidth="1.5"
                                strokeDasharray="4 2"
                              />
                            </svg>
                          </div>
                          <p className="text-sm text-slate-500">
                            Drop tasks here
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer stats */}
      <footer className="fixed bottom-0 left-0 right-0 z-20 border-t border-white/5 bg-slate-950/80 backdrop-blur-sm">
        <div className="max-w-[1800px] mx-auto px-6 py-3">
          <div
            className="flex items-center justify-between text-xs"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            <div className="flex items-center gap-6">
              <span className="text-slate-500">
                <span className={error ? 'text-red-400' : 'text-violet-400'}>
                  ●
                </span>{' '}
                {error ? 'Error' : 'System Active'}
              </span>
              {error && <span className="text-red-400">{error}</span>}
              <span className="text-slate-500">
                Last sync: <span className="text-slate-300">just now</span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-slate-500">
              <span>Press</span>
              <kbd className="px-2 py-1 rounded bg-white/5 text-slate-400">
                ?
              </kbd>
              <span>for keyboard shortcuts</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Add Project Modal */}
      <AddProjectModal
        isOpen={showAddProjectModal}
        onClose={() => setShowAddProjectModal(false)}
        onProjectAdded={handleProjectAdded}
      />

      {/* Add Task Modal */}
      <AddTaskModal
        isOpen={showAddTaskModal}
        onClose={() => setShowAddTaskModal(false)}
        onTaskCreated={() =>
          queryClient.invalidateQueries({
            queryKey: ['tasks', search.projectPath],
          })
        }
        projectPath={currentProject?.path}
      />

      {/* Work Progress Modal */}
      {modalSession && (
        <WorkProgressModalWrapper
          session={modalSession}
          onClose={() => setModalSessionId(null)}
        />
      )}

      {/* Custom font imports */}
      <style>
        @import
        url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
      </style>
    </div>
  )
}
