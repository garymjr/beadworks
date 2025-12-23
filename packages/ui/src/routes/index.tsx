import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'

interface Task {
  id: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  beadColor: string
  tags: string[]
}

interface Column {
  id: string
  title: string
  tasks: Task[]
}

const initialTasks: Task[] = [
  {
    id: 't1',
    title: 'Initialize Agent Core',
    description: 'Bootstrap the primary agent with system prompts and tool bindings',
    priority: 'high',
    beadColor: '#ff6b6b',
    tags: ['core', 'setup'],
  },
  {
    id: 't2',
    title: 'Configure Memory Store',
    description: 'Set up vector database for episodic and semantic memory',
    priority: 'high',
    beadColor: '#ffd93d',
    tags: ['database', 'memory'],
  },
  {
    id: 't3',
    title: 'Implement Tool Registry',
    description: 'Create dynamic tool loading and validation system',
    priority: 'medium',
    beadColor: '#6bcb77',
    tags: ['tools', 'system'],
  },
  {
    id: 't4',
    title: 'Design Task Orchestration',
    description: 'Build the task decomposition and execution pipeline',
    priority: 'medium',
    beadColor: '#4d96ff',
    tags: ['architecture'],
  },
  {
    id: 't5',
    title: 'Create Skill Loader',
    description: 'Implement skill discovery and hot-reloading mechanism',
    priority: 'low',
    beadColor: '#9b59b6',
    tags: ['skills', 'dynamic'],
  },
  {
    id: 't6',
    title: 'Add Logging Infrastructure',
    description: 'Structured logging with trace ID propagation',
    priority: 'low',
    beadColor: '#ff9ff3',
    tags: ['observability'],
  },
]

export default function BeadworksKanban() {
  const [columns, setColumns] = useState<Column[]>([
    { id: 'todo', title: 'Todo', tasks: [] },
    { id: 'blocked', title: 'Blocked', tasks: [] },
    { id: 'ready', title: 'Ready', tasks: [] },
    { id: 'in-progress', title: 'In Progress', tasks: [] },
    { id: 'done', title: 'Done', tasks: [] },
  ])

  const [draggedTask, setDraggedTask] = useState<Task | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)

  // Distribute initial tasks across columns
  useEffect(() => {
    setColumns(prev => {
      const newCols = [...prev]
      newCols[0].tasks = [initialTasks[5]]  // Todo: Logging Infrastructure
      newCols[1].tasks = [initialTasks[4]]  // Blocked: Skill Loader
      newCols[2].tasks = [initialTasks[0], initialTasks[1]]  // Ready: Agent Core, Memory Store
      newCols[3].tasks = [initialTasks[2]]  // In Progress: Tool Registry
      newCols[4].tasks = [initialTasks[3]]  // Done: Task Orchestration
      return newCols
    })
  }, [])

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

  const handleDrop = (e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault()
    
    if (!draggedTask) return

    setColumns(prev => {
      return prev.map(col => {
        if (col.id === targetColumnId) {
          // Check if task already exists in this column
          if (col.tasks.find(t => t.id === draggedTask.id)) {
            return col
          }
          return {
            ...col,
            tasks: [...col.tasks, draggedTask],
          }
        } else {
          return {
            ...col,
            tasks: col.tasks.filter(t => t.id !== draggedTask.id),
          }
        }
      })
    })

    setDraggedTask(null)
    setDragOverColumn(null)
  }

  const handleDragEnd = () => {
    setDraggedTask(null)
    setDragOverColumn(null)
  }

  const getPriorityGlow = (priority: string) => {
    switch (priority) {
      case 'high': return 'shadow-[0_0_30px_rgba(255,107,107,0.4)]'
      case 'medium': return 'shadow-[0_0_30px_rgba(255,217,61,0.4)]'
      case 'low': return 'shadow-[0_0_30px_rgba(107,203,119,0.4)]'
      default: return ''
    }
  }

  const getWirePath = (index: number) => {
    const isDragging = dragOverColumn !== null
    const tension = isDragging ? 15 : 25
    return `M0,${40 + index * 80} Q${tension},${50 + index * 80} 50,${50 + index * 80}`
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
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <circle cx="12" cy="12" r="3" strokeWidth="2" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
                  </svg>
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-slate-900" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  Beadworks
                </h1>
                <p className="text-sm text-slate-400">Agent Task Orchestration</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-sm text-slate-300" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  {columns.reduce((acc, col) => acc + col.tasks.length, 0)} tasks active
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
            {columns.map((column, index) => (
              <div
                key={column.id}
                className="flex-1 min-w-[280px] max-w-[340px]"
              >
                <div className="relative">
                  {/* Wire connector */}
                  <svg className="absolute -top-8 left-1/2 -translate-x-1/2 w-12 h-16 pointer-events-none" style={{ overflow: 'visible' }}>
                    <line
                      x1="24"
                      y1="-20"
                      x2="24"
                      y2="0"
                      stroke="rgba(255,255,255,0.15)"
                      strokeWidth="2"
                      strokeDasharray="4 4"
                    />
                    <circle cx="24" cy="-20" r="4" fill="rgba(255,255,255,0.2)" />
                  </svg>
                  
                  {/* Column header */}
                  <div className="flex items-center justify-between mb-4 px-2">
                    <h2 className="text-lg font-semibold text-white/90" style={{ fontFamily: 'Outfit, sans-serif' }}>
                      {column.title}
                    </h2>
                    <span className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-xs font-medium text-white/70" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
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
                      {column.tasks.map((task, taskIndex) => (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={() => handleDragStart(task)}
                          onDragEnd={handleDragEnd}
                          className={`group relative cursor-grab active:cursor-grabbing transition-all duration-300 ${
                            draggedTask?.id === task.id ? 'opacity-50 scale-95' : 'hover:scale-[1.02]'
                          }`}
                        >
                          {/* Glow effect */}
                          <div className={`absolute -inset-1 rounded-2xl bg-gradient-to-r opacity-0 group-hover:opacity-20 blur-lg transition-opacity duration-300`} style={{ background: task.beadColor }} />
                          
                          {/* Bead task card */}
                          <div className={`relative bg-slate-900/80 backdrop-blur-sm rounded-xl border border-white/10 p-4 shadow-xl ${getPriorityGlow(task.priority)} transition-shadow duration-300`}>
                            {/* Bead indicator */}
                            <div className="absolute -top-3 left-6">
                              <div
                                className="w-8 h-8 rounded-full shadow-lg"
                                style={{
                                  background: `radial-gradient(circle at 30% 30%, ${task.beadColor}dd, ${task.beadColor}88)`,
                                  boxShadow: `0 4px 12px ${task.beadColor}40, inset 0 1px 0 rgba(255,255,255,0.3)`,
                                }}
                              />
                            </div>

                            {/* Task content */}
                            <div className="mt-3">
                              <h3 className="text-white font-medium mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                                {task.title}
                              </h3>
                              <p className="text-sm text-slate-400 leading-relaxed mb-3">
                                {task.description}
                              </p>
                              
                              {/* Tags */}
                              <div className="flex flex-wrap gap-2 mb-3">
                                {task.tags.map(tag => (
                                  <span
                                    key={tag}
                                    className="px-2 py-1 rounded-md text-xs font-medium bg-white/5 text-slate-300 border border-white/10"
                                    style={{ fontFamily: 'JetBrains Mono, monospace' }}
                                  >
                                    #{tag}
                                  </span>
                                ))}
                              </div>

                              {/* Priority indicator */}
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${
                                  task.priority === 'high' ? 'bg-red-400' :
                                  task.priority === 'medium' ? 'bg-yellow-400' :
                                  'bg-emerald-400'
                                }`} />
                                <span className="text-xs text-slate-500 capitalize">{task.priority} priority</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}

                      {column.tasks.length === 0 && (
                        <div className="py-16 text-center">
                          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                            <svg className="w-8 h-8 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <circle cx="12" cy="12" r="10" strokeWidth="1.5" strokeDasharray="4 2" />
                            </svg>
                          </div>
                          <p className="text-sm text-slate-500">Drop tasks here</p>
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
          <div className="flex items-center justify-between text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            <div className="flex items-center gap-6">
              <span className="text-slate-500">
                <span className="text-violet-400">●</span> System Active
              </span>
              <span className="text-slate-500">
                Last sync: <span className="text-slate-300">just now</span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-slate-500">
              <span>Press</span>
              <kbd className="px-2 py-1 rounded bg-white/5 text-slate-400">?</kbd>
              <span>for keyboard shortcuts</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Custom font imports */}
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
      </style>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: BeadworksKanban,
})
