import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  addProject,
  getCurrentProject,
  getProjects,
  setCurrentProjectId,
} from '../lib/projects'
import { DirectoryPicker } from './DirectoryPicker'
import type { Project } from '../lib/projects'

interface AddProjectModalProps {
  isOpen: boolean
  onClose: () => void
  onProjectAdded?: (project: Project) => void
}

export function AddProjectModal({
  isOpen,
  onClose,
  onProjectAdded,
}: AddProjectModalProps) {
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectPath, setNewProjectPath] = useState('')

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setNewProjectName('')
      setNewProjectPath('')
    }
  }, [isOpen])

  function handleAddProject() {
    if (!newProjectName.trim() || !newProjectPath.trim()) {
      alert('Please enter a project name and select a path')
      return
    }

    const newProject = addProject(newProjectName.trim(), newProjectPath.trim())
    setNewProjectName('')
    setNewProjectPath('')
    onClose()

    // Switch to the new project
    setCurrentProjectId(newProject.id)
    onProjectAdded?.(newProject)
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <h2
            className="text-lg font-semibold text-white"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            Add Project
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
        <div className="px-6 py-5 space-y-5">
          {/* Project Name */}
          <div>
            <label
              className="block text-sm font-medium text-slate-300 mb-2"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              Project Name
            </label>
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="My Project"
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            />
          </div>

          {/* Project Path */}
          <div>
            <label
              className="block text-sm font-medium text-slate-300 mb-2"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              Path to Project
            </label>

            <DirectoryPicker
              value={newProjectPath}
              onChange={setNewProjectPath}
              onNameExtracted={(name) => {
                if (!newProjectName) {
                  setNewProjectName(name)
                }
              }}
              placeholder="/Users/username/projects/my-project"
            />
          </div>

          {/* Info Box */}
          <div className="flex items-start gap-3 p-4 rounded-xl bg-violet-500/10 border border-violet-500/20">
            <svg
              className="w-5 h-5 text-violet-400 flex-shrink-0 mt-0.5"
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
            <div className="flex-1">
              <p className="text-sm text-slate-300">
                The project directory should contain a{' '}
                <code className="px-1.5 py-0.5 rounded bg-white/5 text-violet-400">
                  .beads
                </code>{' '}
                folder with your database.
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Initialize with{' '}
                <code className="px-1.5 py-0.5 rounded bg-white/5 text-slate-400">
                  bd init
                </code>{' '}
                if needed.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-5 border-t border-white/10">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-medium hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAddProject}
            disabled={!newProjectName.trim() || !newProjectPath.trim()}
            className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-medium hover:shadow-lg hover:shadow-violet-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Project
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
