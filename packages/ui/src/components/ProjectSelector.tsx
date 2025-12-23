import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  getCurrentProject,
  getProjects,
  removeProject,
  setCurrentProjectId,
} from '../lib/projects'
import type { Project } from '../lib/projects'

// Check if we're on the client side
const isClient = typeof window !== 'undefined'

interface ProjectSelectorProps {
  onProjectChange?: (project: Project | null) => void
  onAddProjectClick?: () => void
}

export function ProjectSelector({
  onProjectChange,
  onAddProjectClick,
}: ProjectSelectorProps) {
  const [projects, setProjects] = useState<Array<Project>>([])
  const [currentProject, setCurrentProject] = useState<Project | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const triggerButtonRef = useRef<HTMLButtonElement>(null)
  const [dropdownPosition, setDropdownPosition] = useState({
    top: true,
    left: true,
  })

  // Load projects on mount
  useEffect(() => {
    loadProjects()
  }, [])

  // Close dropdown when clicking outside
  // useEffect(() => {
  //   function handleClickOutside(event: MouseEvent) {
  //     if (
  //       dropdownRef.current &&
  //       !dropdownRef.current.contains(event.target as Node)
  //     ) {
  //       setIsOpen(false)
  //     }
  //   }
  //
  //   if (isOpen) {
  //     document.addEventListener('mousedown', handleClickOutside)
  //   }
  //
  //   return () => {
  //     document.removeEventListener('mousedown', handleClickOutside)
  //   }
  // }, [isOpen])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      // Use 'click' instead of 'mousedown' to allow button clicks to complete
      document.addEventListener('click', handleClickOutside, { capture: true })
    }

    return () => {
      document.removeEventListener('click', handleClickOutside, { capture: true })
    }
  }, [isOpen])

  // Adjust dropdown position to stay within viewport
  useEffect(() => {
    if (!isOpen || !triggerButtonRef.current) return

    const updatePosition = () => {
      const trigger = triggerButtonRef.current
      if (!trigger) return

      const triggerRect = trigger.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      // Check if dropdown would overflow on the right (estimated width 288px = w-72)
      const dropdownWidth = 288
      const overflowRight = triggerRect.left + dropdownWidth > viewportWidth - 16

      setDropdownPosition({
        top: true, // Always show below for now
        left: !overflowRight,
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)

    return () => {
      window.removeEventListener('resize', updatePosition)
    }
  }, [isOpen])

  // Calculate dropdown position styles
  const getDropdownStyle = () => {
    if (!triggerButtonRef.current) return {}

    const triggerRect = triggerButtonRef.current.getBoundingClientRect()
    const dropdownWidth = 288 // w-72

    return {
      position: 'fixed',
      top: `${triggerRect.bottom + 8}px`, // mt-2 = 8px
      left: dropdownPosition.left
        ? `${triggerRect.left}px`
        : `${triggerRect.right - dropdownWidth}px`,
      zIndex: 9999,
    } as React.CSSProperties
  }

  function loadProjects() {
    const loadedProjects = getProjects()
    setProjects(loadedProjects)
    const current = getCurrentProject()
    setCurrentProject(current)
  }

  function handleSelectProject(project: Project) {
    setCurrentProjectId(project.id)
    setCurrentProject(project)
    setIsOpen(false)
    onProjectChange?.(project)
  }

  function handleRemoveProject(e: React.MouseEvent, projectId: string) {
    e.stopPropagation()
    if (confirm('Remove this project from Beadworks?')) {
      removeProject(projectId)

      // If we removed the current project, clear it and notify
      if (currentProject?.id === projectId) {
        setCurrentProject(null)
        onProjectChange?.(null)
      }

      loadProjects()
    }
  }

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        {/* Current Project Button */}
        <button
          ref={triggerButtonRef}
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all duration-200"
        >
          {currentProject ? (
            <>
              <div
                className="w-4 h-4 rounded-full"
                style={{
                  background: `radial-gradient(circle at 30% 30%, ${currentProject.color}dd, ${currentProject.color}88)`,
                  boxShadow: `0 0 12px ${currentProject.color}40`,
                }}
              />
              <span
                className="text-sm font-medium text-white"
                style={{ fontFamily: 'Outfit, sans-serif' }}
              >
                {currentProject.name}
              </span>
            </>
          ) : (
            <>
              <div className="w-4 h-4 rounded-full bg-white/20" />
              <span className="text-sm text-slate-400">No Project</span>
            </>
          )}
          <svg
            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
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
        </button>
      </div>

      {/* Dropdown - rendered via portal to avoid z-index issues */}
      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            role="dropdown"
            style={getDropdownStyle()}
            className="w-72 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-white/10">
              <h3
                className="text-sm font-semibold text-white"
                style={{ fontFamily: 'Outfit, sans-serif' }}
              >
                Projects
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {projects.length} project{projects.length !== 1 ? 's' : ''}{' '}
                configured
              </p>
            </div>

            {/* Project List */}
            <div className="max-h-80 overflow-y-auto">
              {projects.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-white/5 flex items-center justify-center">
                    <svg
                      className="w-6 h-6 text-white/30"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                      />
                    </svg>
                  </div>
                  <p className="text-sm text-slate-400">No projects yet</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Add your first project to get started
                  </p>
                </div>
              ) : (
                <div className="py-2">
                  {projects.map((project) => (
                    <div
                      key={project.id}
                      className={`relative group flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${currentProject?.id === project.id
                        ? 'bg-violet-500/10'
                        : 'hover:bg-white/5'
                        }`}
                      onClick={() => handleSelectProject(project)}
                    >
                      {/* Bead indicator */}
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{
                          background: `radial-gradient(circle at 30% 30%, ${project.color}dd, ${project.color}88)`,
                          boxShadow:
                            currentProject?.id === project.id
                              ? `0 0 12px ${project.color}60`
                              : 'none',
                        }}
                      />

                      {/* Project info */}
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-medium text-white truncate"
                          style={{ fontFamily: 'Outfit, sans-serif' }}
                        >
                          {project.name}
                        </p>
                        <p
                          className="text-xs text-slate-500 truncate"
                          style={{ fontFamily: 'JetBrains Mono, monospace' }}
                        >
                          {project.path}
                        </p>
                      </div>

                      {/* Active indicator */}
                      {currentProject?.id === project.id && (
                        <svg
                          className="w-4 h-4 text-violet-400 flex-shrink-0"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}

                      {/* Remove button */}
                      <button
                        onClick={(e) => handleRemoveProject(e, project.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-500/20 transition-all"
                      >
                        <svg
                          className="w-4 h-4 text-slate-400 hover:text-red-400"
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
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-white/10">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onAddProjectClick?.()
                  setIsOpen(false)
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 text-white text-sm font-medium hover:shadow-lg hover:shadow-violet-500/25 transition-all duration-300"
              >
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
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Add Project
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
