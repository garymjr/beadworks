import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { getTasks, updateTaskStatus } from '../lib/api/server-fns'
import { COLUMN_STATUS_MAP, STATUS_COLUMN_MAP } from '../lib/api/types'
import { ProjectSelector } from '../components/ProjectSelector'
import { getCurrentProject } from '../lib/projects'
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

export const Route = createFileRoute('/')({
  component: BeadworksKanban,
  validateSearch: (search: Record<string, unknown>) => ({
    projectPath:
      typeof search.projectPath === 'string' ? search.projectPath : undefined,
  }),
  loader: async ({ search }) => {
    // Only load tasks if a project is selected
    const projectPath = search?.projectPath
    if (!projectPath) {
      return { tasks: [], error: null }
    }

    try {
      const tasks = await getTasks({ data: projectPath })
      return { tasks, error: null }
    } catch (error) {
      console.error('Failed to load tasks:', error)
      return {
        tasks: [],
        error: error instanceof Error ? error.message : 'Failed to load tasks',
      }
    }
  },
})

function BeadworksKanban() {
  const router = useRouter()
  const { tasks: initialTasks, error } = Route.useLoaderData()

  const [columns, setColumns] = useState<Array<Column>>([
    { id: 'todo', title: 'Todo', tasks: [] },
    { id: 'blocked', title: 'Blocked', tasks: [] },
    { id: 'ready', title: 'Ready', tasks: [] },
    { id: 'in-progress', title: 'In Progress', tasks: [] },
    { id: 'done', title: 'Done', tasks: [] },
  ])

  const [draggedTask, setDraggedTask] = useState<Task | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState<string | null>(null)

  // Track current project - initialize safely for SSR
  const [currentProject, setCurrentProject] = useState<Project | null>(null)

  // Load current project from localStorage on mount
  useEffect(() => {
    const project = getCurrentProject()
    setCurrentProject(project)

    // Sync URL with current project
    if (project?.path) {
      const url = new URL(window.location.href)
      if (!url.searchParams.get('projectPath')) {
        url.searchParams.set('projectPath', project.path)
        window.history.replaceState({}, '', url.toString())
      }
    } else {
      // Clear projectPath from URL if no project selected
      const url = new URL(window.location.href)
      url.searchParams.delete('projectPath')
      window.history.replaceState({}, '', url.toString())
    }
  }, [])

  // Handle project changes - update URL and refetch
  const handleProjectChange = useCallback(
    (project: Project | null) => {
      setCurrentProject(project)

      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href)
        if (project?.path) {
          url.searchParams.set('projectPath', project.path)
        } else {
          url.searchParams.delete('projectPath')
        }
        window.history.replaceState({}, '', url.toString())

        // Refetch with new project path
        router.invalidate()
      }
    },
    [router],
  )

  // Organize tasks into columns
  useEffect(() => {
    setColumns((prev) => {
      const newCols = prev.map((col) => ({ ...col, tasks: [] }))

      initialTasks.forEach((task) => {
        const columnId = STATUS_COLUMN_MAP[task.status] || 'todo'
        const colIndex = newCols.findIndex((c) => c.id === columnId)
        if (colIndex !== -1) {
          newCols[colIndex].tasks.push(task)
        }
      })

      return newCols
    })
  }, [initialTasks])

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
      await updateTaskStatus({
        id: draggedTask.id,
        status: newStatus,
        projectPath: currentProject?.path,
      })
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
                <ProjectSelector onProjectChange={handleProjectChange} />
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
              <ProjectSelector onProjectChange={handleProjectChange} />

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
              <button className="px-5 py-2.5 rounded-full bg-gradient-to-r from-violet-600 to-purple-600 text-white text-sm font-medium hover:shadow-lg hover:shadow-purple-500/25 transition-all duration-300 hover:scale-105">
                + New Task
              </button>
            </div>
          </div>
        </div>
      </header>

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
                    <h2
                      className="text-lg font-semibold text-white/90"
                      style={{ fontFamily: 'Outfit, sans-serif' }}
                    >
                      {column.title}
                    </h2>
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
                                </div>
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

      {/* Custom font imports */}
      <style>
        @import
        url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
      </style>
    </div>
  )
}
