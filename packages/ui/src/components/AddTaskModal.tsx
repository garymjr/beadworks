import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  {
    value: 0,
    label: 'Critical',
    description: 'Security, data loss, broken builds',
  },
  { value: 1, label: 'High', description: 'Major features, important bugs' },
  { value: 2, label: 'Medium', description: 'Default, nice-to-have' },
  { value: 3, label: 'Low', description: 'Polish, optimization' },
  { value: 4, label: 'Backlog', description: 'Future ideas' },
] as const

// Helper component for edited indicator badge
function EditedBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-medium">
      <svg
        className="w-3 h-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732a2.5 2.5 0 00-3.536-3.536z"
        />
      </svg>
      Edited
    </span>
  )
}

export function AddTaskModal({
  isOpen,
  onClose,
  onTaskCreated,
  projectPath,
}: AddTaskModalProps) {
  const [prompt, setPrompt] = useState('')
  const [type, setType] = useState<
    'bug' | 'feature' | 'task' | 'epic' | 'chore'
  >('task')
  const [priority, setPriority] = useState(2)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Original AI-generated values (preserved for comparison)
  const [generatedTitle, setGeneratedTitle] = useState<string | null>(null)
  const [generatedLabels, setGeneratedLabels] = useState<Array<string> | null>(null)
  const [generatedDescription, setGeneratedDescription] = useState<string | null>(null)

  // Edited values (user modifications)
  const [editedTitle, setEditedTitle] = useState<string | null>(null)
  const [editedLabels, setEditedLabels] = useState<Array<string> | null>(null)
  const [editedDescription, setEditedDescription] = useState<string | null>(null)

  // New label input state
  const [newLabelInput, setNewLabelInput] = useState('')

  // Refs for focus management
  const modalRef = useRef<HTMLDivElement>(null)
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const generateButtonRef = useRef<HTMLButtonElement>(null)
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null)
  const labelInputRef = useRef<HTMLInputElement>(null)

  // Determine if fields have been edited
  const titleEdited = useMemo(
    () => editedTitle !== null && editedTitle !== generatedTitle,
    [editedTitle, generatedTitle],
  )

  const descriptionEdited = useMemo(
    () => editedDescription !== null && editedDescription !== generatedDescription,
    [editedDescription, generatedDescription],
  )

  const labelsEdited = useMemo(
    () => {
      if (editedLabels === null || generatedLabels === null) return false
      if (editedLabels.length !== generatedLabels.length) return true
      // Sort arrays for comparison since order doesn't matter
      const sortedEdited = [...editedLabels].sort()
      const sortedGenerated = [...generatedLabels].sort()
      return sortedEdited.some((label, i) => label !== sortedGenerated[i])
    },
    [editedLabels, generatedLabels],
  )

  // Get the current effective values (edited if exists, otherwise generated)
  const currentTitle = editedTitle ?? generatedTitle
  const currentDescription = editedDescription ?? generatedDescription
  const currentLabels = editedLabels ?? generatedLabels

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setPrompt('')
      setType('task')
      setPriority(2)
      setGeneratedTitle(null)
      setGeneratedLabels(null)
      setGeneratedDescription(null)
      setEditedTitle(null)
      setEditedLabels(null)
      setEditedDescription(null)
      setNewLabelInput('')
    }
  }, [isOpen])

  // Focus management: store previously focused element and focus prompt textarea
  useEffect(() => {
    if (isOpen) {
      // Store the currently focused element
      previouslyFocusedElementRef.current = document.activeElement as HTMLElement

      // Focus the prompt textarea after a short delay to ensure the modal is rendered
      const timeoutId = setTimeout(() => {
        promptTextareaRef.current?.focus()
      }, 50)

      return () => clearTimeout(timeoutId)
    } else {
      // Restore focus to the previously focused element when modal closes
      if (previouslyFocusedElementRef.current) {
        previouslyFocusedElementRef.current.focus()
      }
    }
  }, [isOpen])

  // Focus trap: keep Tab navigation within the modal
  useEffect(() => {
    if (!isOpen) return

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      const modal = modalRef.current
      if (!modal) return

      const focusableElements = modal.querySelectorAll<
        HTMLElement | SVGElement
      >(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )

      // Filter out disabled elements and convert to array
      const focusable = Array.from(focusableElements).filter((el) => {
        // Check if element is disabled (only applies to certain form elements)
        if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement ||
            el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
          return !el.disabled && el.tabIndex >= 0
        }
        if (el instanceof HTMLElement || el instanceof SVGElement) {
          return el.tabIndex >= 0
        }
        return false
      })

      if (focusable.length === 0) return

      const firstElement = focusable[0]
      const lastElement = focusable[focusable.length - 1]

      // If shift+tab on first element, move to last
      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault()
        ;(lastElement as HTMLElement).focus()
      }
      // If tab on last element, move to first
      else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault()
        ;(firstElement as HTMLElement).focus()
      }
    }

    document.addEventListener('keydown', handleTabKey)
    return () => document.removeEventListener('keydown', handleTabKey)
  }, [isOpen])

  // Focus management: move focus to the first element in the generated content after generation
  useEffect(() => {
    if (generatedTitle && !isGenerating) {
      // After generation completes, focus moves to the first actionable element
      generateButtonRef.current?.focus()
    }
  }, [generatedTitle, isGenerating])

  async function generateTaskDetails() {
    if (!prompt.trim()) {
      alert('Please enter a prompt')
      return
    }

    setIsGenerating(true)

    try {
      const result = await generateTask(prompt.trim(), type, projectPath)
      setGeneratedTitle(result.title)
      setGeneratedDescription(result.description || null)
      setGeneratedLabels(result.labels || [])
      
      // Initialize edited values with generated content so it appears in the editable fields
      setEditedTitle(result.title)
      setEditedDescription(result.description || null)
      setEditedLabels(result.labels || null)
      setNewLabelInput('')
    } catch (error) {
      console.error('Failed to generate task details:', error)
      alert(
        error instanceof Error
          ? error.message
          : 'Failed to generate task details',
      )
    } finally {
      setIsGenerating(false)
    }
  }

  // Label management functions
  const addLabel = useCallback((label: string) => {
    const trimmedLabel = label.trim()
    if (!trimmedLabel) return

    // Don't allow duplicate labels
    const currentLabelsList = currentLabels || []
    if (currentLabelsList.includes(trimmedLabel)) {
      // Clear input even if duplicate (user feedback that it exists)
      setNewLabelInput('')
      return
    }

    // Update editedLabels with the new label added
    setEditedLabels([...currentLabelsList, trimmedLabel])
    setNewLabelInput('')
  }, [currentLabels])

  const removeLabel = useCallback((labelToRemove: string) => {
    const currentLabelsList = currentLabels || []
    // Update editedLabels with the label removed
    setEditedLabels(currentLabelsList.filter((label) => label !== labelToRemove))
  }, [currentLabels])

  const handleLabelInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addLabel(newLabelInput)
    }
  }, [newLabelInput, addLabel])

  async function handleSubmit() {
    if (!currentTitle) {
      // Generate first if not already generated
      await generateTaskDetails()
      return
    }

    setIsSubmitting(true)

    try {
      const input: CreateTaskInput = {
        title: currentTitle,
        type,
        priority: priority.toString(),
      }

      // Use the current (possibly edited) description, or fall back to the original prompt
      const descriptionToUse = currentDescription || prompt.trim()
      if (descriptionToUse) {
        input.description = descriptionToUse
      }

      if (currentLabels && currentLabels.length > 0) {
        input.labels = currentLabels
      }

      console.log('[AddTaskModal] Creating task with priority:', priority, 'type:', typeof priority, 'input:', input)
      await createTask(input, projectPath)

      // Reset and close
      setPrompt('')
      setType('task')
      setPriority(2)
      setGeneratedTitle(null)
      setGeneratedLabels(null)
      setGeneratedDescription(null)
      setEditedTitle(null)
      setEditedLabels(null)
      setEditedDescription(null)
      setNewLabelInput('')
      onClose()

      // Trigger refresh
      onTaskCreated?.()
    } catch (error) {
      console.error('Failed to create task:', error)
      alert(error instanceof Error ? error.message : 'Failed to create task')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Revert functions to restore original AI-generated values
  const revertTitle = useCallback(() => {
    setEditedTitle(null)
  }, [])

  const revertDescription = useCallback(() => {
    setEditedDescription(null)
  }, [])

  const revertLabels = useCallback(() => {
    setEditedLabels(null)
  }, [])

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Cmd+Enter or Ctrl+Enter: generate or submit
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        if (!generatedTitle) {
          generateTaskDetails()
        } else {
          handleSubmit()
        }
      }
      // Escape: close modal
      else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
      // Ctrl+Z: revert last edit
      else if (e.key === 'z' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        // Revert in reverse order: labels -> description -> title
        if (labelsEdited) {
          revertLabels()
        } else if (descriptionEdited) {
          revertDescription()
        } else if (titleEdited) {
          revertTitle()
        }
      }
    },
    [generatedTitle, onClose, titleEdited, descriptionEdited, labelsEdited, revertTitle, revertDescription, revertLabels],
  )

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="presentation"
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby="modal-description"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <h2
            id="modal-title"
            className="text-lg font-semibold text-white"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            New Task
          </h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Close dialog"
          >
            <svg
              className="w-5 h-5 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
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
          {/* Prompt */}
          <div>
            <label
              htmlFor="task-prompt"
              className="block text-sm font-medium text-slate-300 mb-2"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              Prompt <span className="text-red-400">*</span>
            </label>
            <textarea
              ref={promptTextareaRef}
              id="task-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Briefly describe what you need... The AI will generate a full title, description, and labels."
              rows={4}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all resize-none"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
              aria-describedby="prompt-description"
              aria-required="true"
            />
            <p
              id="prompt-description"
              className="text-xs text-slate-500 mt-1.5"
            >
              The AI will expand your prompt into a complete task with title,
              detailed description, and relevant labels
            </p>
          </div>

          {/* Type and Priority */}
          <div className="grid grid-cols-2 gap-4">
            {/* Type */}
            <div>
              <label
                htmlFor="task-type"
                className="block text-sm font-medium text-slate-300 mb-2"
                style={{ fontFamily: 'Outfit, sans-serif' }}
              >
                Type
              </label>
              <div className="relative">
                <select
                  id="task-type"
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
                  aria-label="Select task type"
                >
                  {ISSUE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <div
                  className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                >
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
                htmlFor="task-priority"
                className="block text-sm font-medium text-slate-300 mb-2"
                style={{ fontFamily: 'Outfit, sans-serif' }}
              >
                Priority
              </label>
              <div className="relative">
                <select
                  id="task-priority"
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all appearance-none cursor-pointer"
                  style={{ fontFamily: 'JetBrains Mono, monospace' }}
                  aria-label="Select task priority"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <div
                  className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                >
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
          {currentTitle && (
            <div
              className={`p-4 rounded-xl bg-gradient-to-br from-violet-500/10 to-purple-500/10 border transition-all duration-200 ${
                (titleEdited || descriptionEdited || labelsEdited)
                  ? 'border-amber-500/50'
                  : 'border-violet-500/30'
              }`}
              role="region"
              aria-labelledby="generated-content-heading"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-violet-300">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  <span
                    id="generated-content-heading"
                    className="text-xs font-medium uppercase tracking-wide"
                  >
                    AI Generated
                  </span>
                </div>
                {/* Overall edited indicator */}
                {(titleEdited || descriptionEdited || labelsEdited) && (
                  <EditedBadge />
                )}
              </div>

              {/* Generated Title */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="task-title-input" className="block text-xs font-medium text-slate-400">
                    Title
                  </label>
                  <div className="flex items-center gap-2">
                    {titleEdited && (
                      <>
                        <EditedBadge />
                        <button
                          onClick={revertTitle}
                          className="text-xs text-slate-400 hover:text-slate-300 underline underline-offset-2"
                          aria-label="Revert title to original AI-generated value"
                        >
                          Revert
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <input
                  id="task-title-input"
                  type="text"
                  value={editedTitle ?? currentTitle ?? ''}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  placeholder="Task title"
                  className={`w-full px-3 py-2 rounded-lg text-white text-sm transition-all duration-200 ${
                    titleEdited
                      ? 'bg-amber-500/10 border-amber-500/30 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'
                      : 'bg-white/5 border border-transparent focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent'
                  }`}
                  role="textbox"
                  aria-label="Task title"
                  aria-describedby={titleEdited ? 'title-edited-hint' : undefined}
                />
                {titleEdited && (
                  <p id="title-edited-hint" className="text-xs text-amber-400/70 mt-1">
                    Title has been edited from the AI-generated version
                  </p>
                )}
              </div>

              {/* Generated Description */}
              {currentDescription && (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="task-description-input" className="block text-xs font-medium text-slate-400">
                      Description
                    </label>
                    <div className="flex items-center gap-2">
                      {descriptionEdited && (
                        <>
                          <EditedBadge />
                          <button
                            onClick={revertDescription}
                            className="text-xs text-slate-400 hover:text-slate-300 underline underline-offset-2"
                            aria-label="Revert description to original AI-generated value"
                          >
                            Revert
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <textarea
                    id="task-description-input"
                    value={editedDescription ?? currentDescription ?? ''}
                    onChange={(e) => setEditedDescription(e.target.value)}
                    placeholder="Task description"
                    rows={6}
                    className={`w-full px-3 py-2 rounded-lg text-white text-sm whitespace-pre-wrap transition-all duration-200 resize-y ${
                      descriptionEdited
                        ? 'bg-amber-500/10 border-amber-500/30 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'
                        : 'bg-white/5 border border-transparent focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent'
                    }`}
                    role="textbox"
                    aria-multiline="true"
                    aria-label="Task description"
                    aria-describedby={descriptionEdited ? 'description-edited-hint' : undefined}
                  />
                  {descriptionEdited && (
                    <p id="description-edited-hint" className="text-xs text-amber-400/70 mt-1">
                      Description has been edited from the AI-generated version
                    </p>
                  )}
                </div>
              )}

              {/* Editable Labels */}
              {currentLabels && currentLabels.length > 0 && (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-400">
                      Labels
                    </label>
                    <div className="flex items-center gap-2">
                      {labelsEdited && (
                        <>
                          <EditedBadge />
                          <button
                            onClick={revertLabels}
                            className="text-xs text-slate-400 hover:text-slate-300 underline underline-offset-2"
                            aria-label="Revert labels to original AI-generated values"
                          >
                            Revert
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div
                    className={`flex flex-wrap gap-2 p-2 rounded-lg transition-all duration-200 ${
                      labelsEdited
                        ? 'bg-amber-500/10 border border-amber-500/30'
                        : 'bg-transparent border border-transparent'
                    }`}
                    role="list"
                    aria-label="Task labels"
                  >
                    {currentLabels.map((label) => (
                      <span
                        key={label}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-violet-500/20 text-violet-300 text-xs border border-violet-500/30 group hover:bg-violet-500/30 transition-colors"
                        role="listitem"
                      >
                        <span>{label}</span>
                        <button
                          onClick={() => removeLabel(label)}
                          className="ml-1 text-violet-400 hover:text-red-400 transition-colors"
                          aria-label={`Remove label: ${label}`}
                          title={`Remove ${label}`}
                        >
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
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                  
                  {/* Add new label input */}
                  <div className="mt-2 flex gap-2">
                    <input
                      ref={labelInputRef}
                      type="text"
                      value={newLabelInput}
                      onChange={(e) => setNewLabelInput(e.target.value)}
                      onKeyDown={handleLabelInputKeyDown}
                      placeholder="Add a label..."
                      className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                      style={{ fontFamily: 'JetBrains Mono, monospace' }}
                      aria-label="Add new label"
                    />
                    <button
                      onClick={() => addLabel(newLabelInput)}
                      disabled={!newLabelInput.trim()}
                      className="px-3 py-1.5 rounded-lg bg-violet-500/20 border border-violet-500/30 text-violet-300 text-xs hover:bg-violet-500/30 hover:border-violet-500/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="Add label"
                    >
                      Add
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Press Enter to add a label
                  </p>
                </div>
              )}

              <button
                onClick={() => {
                  // Reset all generated and edited state
                  setGeneratedTitle(null)
                  setGeneratedLabels(null)
                  setGeneratedDescription(null)
                  setEditedTitle(null)
                  setEditedLabels(null)
                  setEditedDescription(null)
                  setNewLabelInput('')
                  // Refocus the title input after regenerating
                  setTimeout(() => {
                    const titleInput = document.getElementById('task-title-input') as HTMLInputElement
                    titleInput?.focus()
                    titleInput?.select()
                  }, 50)
                }}
                className="text-xs text-slate-400 hover:text-slate-300 underline underline-offset-2"
                aria-label="Regenerate task details"
              >
                Regenerate
              </button>
            </div>
          )}

          {/* Keyboard hint */}
          <div
            className="flex items-center gap-2 p-3 rounded-lg bg-white/5 border border-white/10"
            role="note"
            aria-label="Keyboard shortcuts"
          >
            <kbd
              className="px-2 py-1 rounded bg-white/10 text-slate-400 text-xs"
              aria-hidden="true"
            >
              ⌘ Enter
            </kbd>
            <span className="text-xs text-slate-500">
              {currentTitle ? 'to create task' : 'to generate task details'}
            </span>
            {currentTitle && (
              <>
                <span className="text-xs text-slate-600">•</span>
                <kbd
                  className="px-2 py-1 rounded bg-white/10 text-slate-400 text-xs"
                  aria-hidden="true"
                >
                  Esc
                </kbd>
                <span className="text-xs text-slate-500">to cancel</span>
              </>
            )}
            {(titleEdited || descriptionEdited || labelsEdited) && (
              <>
                <span className="text-xs text-slate-600">•</span>
                <kbd
                  className="px-2 py-1 rounded bg-white/10 text-slate-400 text-xs"
                  aria-hidden="true"
                >
                  ⌘ Z
                </kbd>
                <span className="text-xs text-slate-500">to revert edit</span>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-5 border-t border-white/10">
          <button
            ref={cancelButtonRef}
            onClick={onClose}
            disabled={isSubmitting || isGenerating}
            className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-medium hover:bg-white/10 transition-colors disabled:opacity-50"
            aria-label="Cancel task creation"
          >
            Cancel
          </button>
          <button
            ref={generateButtonRef}
            onClick={() => {
              if (currentTitle) {
                handleSubmit()
              } else {
                generateTaskDetails()
              }
            }}
            disabled={
              isGenerating ||
              isSubmitting ||
              (!currentTitle && !prompt.trim())
            }
            className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-medium hover:shadow-lg hover:shadow-violet-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={
              currentTitle ? 'Create task with generated details' : 'Generate task details from prompt'
            }
          >
            {isGenerating
              ? 'Generating...'
              : isSubmitting
                ? 'Creating...'
                : currentTitle
                  ? 'Create Task'
                  : 'Generate Task'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
