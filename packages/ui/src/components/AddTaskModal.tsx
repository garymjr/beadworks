import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { createTask } from '../lib/api/client'
import type { CreateTaskInput } from '../lib/api/types'

interface AddTaskModalProps {
  isOpen: boolean
  onClose: () => void
  onTaskCreated?: () => void
  projectPath?: string
}

const ISSUE_TYPES = [
  { value: 'task', label: 'Task' },
  { value: 'feature', label: 'Feature' },
  { value: 'bug', label: 'Bug' },
  { value: 'chore', label: 'Chore' },
  { value: 'epic', label: 'Epic' },
] as const

const PRIORITIES = [
  { value: 0, label: 'Critical', description: 'Security, data loss, broken builds' },
  { value: 1, label: 'High', description: 'Major features, important bugs' },
  { value: 2, label: 'Medium', description: 'Default, nice-to-have' },
  { value: 3, label: 'Low', description: 'Polish, optimization' },
  { value: 4, label: 'Backlog', description: 'Future ideas' },
] as const

export function AddTaskModal({
  isOpen,
  onClose,
  onTaskCreated,
  projectPath,
}: AddTaskModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<'bug' | 'feature' | 'task' | 'epic' | 'chore'>('task')
  const [priority, setPriority] = useState(2)
  const [labels, setLabels] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setTitle('')
      setDescription('')
      setType('task')
      setPriority(2)
      setLabels('')
    }
  }, [isOpen])

  async function handleSubmit() {
    if (!title.trim()) {
      alert('Please enter a task title')
      return
    }

    setIsSubmitting(true)

    try {
      const input: CreateTaskInput = {
        title: title.trim(),
        type,
        priority,
      }

      if (description.trim()) {
        input.description = description.trim()
      }

      if (labels.trim()) {
        input.labels = labels
          .split(',')
          .map((l) => l.trim())
          .filter((l) => l.length > 0)
      }

      await createTask(input, projectPath)

      // Reset and close
      setTitle('')
      setDescription('')
      setType('task')
      setPriority(2)
      setLabels('')
      onClose()

      // Trigger refresh
      onTaskCreated?.()
    } catch (error) {
      console.error('Failed to create task:', error)
      alert(
        error instanceof Error ? error.message : 'Failed to create task',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit()
    }
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        className="w-full max-w-lg bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <h2
            className="text-lg font-semibold text-white"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            New Task
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <svg
              className="w-5 h-5 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Title */}
          <div>
            <label
              className="block text-sm font-medium text-slate-300 mb-2"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label
              className="block text-sm font-medium text-slate-300 mb-2"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add more details about this task..."
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all resize-none"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            />
          </div>

          {/* Type and Priority */}
          <div className="grid grid-cols-2 gap-4">
            {/* Type */}
            <div>
              <label
                className="block text-sm font-medium text-slate-300 mb-2"
                style={{ fontFamily: 'Outfit, sans-serif' }}
              >
                Type
              </label>
              <div className="relative">
                <select
                  value={type}
                  onChange={(e) =>
                    setType(
                      e.target.value as
                        | 'bug'
                        | 'feature'
                        | 'task'
                        | 'epic'
                        | 'chore',
                    )
                  }
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all appearance-none cursor-pointer"
                  style={{ fontFamily: 'JetBrains Mono, monospace' }}
                >
                  {ISSUE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg
                    className="w-4 h-4 text-slate-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </div>
            </div>

            {/* Priority */}
            <div>
              <label
                className="block text-sm font-medium text-slate-300 mb-2"
                style={{ fontFamily: 'Outfit, sans-serif' }}
              >
                Priority
              </label>
              <div className="relative">
                <select
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all appearance-none cursor-pointer"
                  style={{ fontFamily: 'JetBrains Mono, monospace' }}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg
                    className="w-4 h-4 text-slate-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Labels */}
          <div>
            <label
              className="block text-sm font-medium text-slate-300 mb-2"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              Labels
            </label>
            <input
              type="text"
              value={labels}
              onChange={(e) => setLabels(e.target.value)}
              placeholder="frontend, backend, urgent (comma separated)"
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            />
            <p className="text-xs text-slate-500 mt-1.5">
              Separate multiple labels with commas
            </p>
          </div>

          {/* Keyboard hint */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-white/5 border border-white/10">
            <kbd className="px-2 py-1 rounded bg-white/10 text-slate-400 text-xs">
              ⌘ Enter
            </kbd>
            <span className="text-xs text-slate-500">
              to submit quickly
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-5 border-t border-white/10">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-medium hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || isSubmitting}
            className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-medium hover:shadow-lg hover:shadow-violet-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Creating...' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
