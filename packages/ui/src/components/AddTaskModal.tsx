import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { createTask, generateTask } from '../lib/api/client'
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
  const [description, setDescription] = useState('')
  const [type, setType] = useState<'bug' | 'feature' | 'task' | 'epic' | 'chore'>('task')
  const [priority, setPriority] = useState(2)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [generatedTitle, setGeneratedTitle] = useState<string | null>(null)
  const [generatedLabels, setGeneratedLabels] = useState<string[] | null>(null)

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setDescription('')
      setType('task')
      setPriority(2)
      setGeneratedTitle(null)
      setGeneratedLabels(null)
    }
  }, [isOpen])

  async function generateTitleAndLabels() {
    if (!description.trim()) {
      alert('Please enter a description')
      return
    }

    setIsGenerating(true)

    try {
      const result = await generateTask(description.trim(), type, projectPath)
      setGeneratedTitle(result.title)
      setGeneratedLabels(result.labels || [])
    } catch (error) {
      console.error('Failed to generate title and labels:', error)
      alert(
        error instanceof Error ? error.message : 'Failed to generate title and labels',
      )
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleSubmit() {
    if (!generatedTitle) {
      // Generate first if not already generated
      await generateTitleAndLabels()
      return
    }

    setIsSubmitting(true)

    try {
      const input: CreateTaskInput = {
        title: generatedTitle,
        type,
        priority: priority.toString(),
      }

      if (description.trim()) {
        input.description = description.trim()
      }

      if (generatedLabels && generatedLabels.length > 0) {
        input.labels = generatedLabels
      }

      await createTask(input, projectPath)

      // Reset and close
      setDescription('')
      setType('task')
      setPriority(2)
      setGeneratedTitle(null)
      setGeneratedLabels(null)
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
      if (!generatedTitle) {
        generateTitleAndLabels()
      } else {
        handleSubmit()
      }
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
          {/* Description */}
          <div>
            <label
              className="block text-sm font-medium text-slate-300 mb-2"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              Description <span className="text-red-400">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what needs to be done... The AI will generate a title and labels for you."
              rows={4}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all resize-none"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
              autoFocus
            />
            <p className="text-xs text-slate-500 mt-1.5">
              The AI will generate a concise title and relevant labels from your description
            </p>
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

          {/* Generated Preview */}
          {generatedTitle && (
            <div className="p-4 rounded-xl bg-gradient-to-br from-violet-500/10 to-purple-500/10 border border-violet-500/30 space-y-3">
              <div className="flex items-center gap-2 text-violet-300">
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
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                <span className="text-xs font-medium uppercase tracking-wide">AI Generated</span>
              </div>

              {/* Generated Title */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Title
                </label>
                <div className="px-3 py-2 rounded-lg bg-white/5 text-white text-sm">
                  {generatedTitle}
                </div>
              </div>

              {/* Generated Labels */}
              {generatedLabels && generatedLabels.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Labels
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {generatedLabels.map((label) => (
                      <span
                        key={label}
                        className="px-2 py-1 rounded-md bg-violet-500/20 text-violet-300 text-xs border border-violet-500/30"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  setGeneratedTitle(null)
                  setGeneratedLabels(null)
                }}
                className="text-xs text-slate-400 hover:text-slate-300 underline underline-offset-2"
              >
                Regenerate
              </button>
            </div>
          )}

          {/* Keyboard hint */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-white/5 border border-white/10">
            <kbd className="px-2 py-1 rounded bg-white/10 text-slate-400 text-xs">
              ⌘ Enter
            </kbd>
            <span className="text-xs text-slate-500">
              {generatedTitle ? 'to create task' : 'to generate title & labels'}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-5 border-t border-white/10">
          <button
            onClick={onClose}
            disabled={isSubmitting || isGenerating}
            className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-medium hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (generatedTitle) {
                handleSubmit()
              } else {
                generateTitleAndLabels()
              }
            }}
            disabled={isGenerating || isSubmitting || (!generatedTitle && !description.trim())}
            className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-medium hover:shadow-lg hover:shadow-violet-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? 'Generating...' : isSubmitting ? 'Creating...' : generatedTitle ? 'Create Task' : 'Generate Title & Labels'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
