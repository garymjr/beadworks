import { useState, useRef, useEffect } from 'react'
import { 
  getProjects, 
  getCurrentProject, 
  setCurrentProjectId, 
  addProject, 
  removeProject,
  type Project 
} from '../lib/projects'

// Check if we're on the client side
const isClient = typeof window !== 'undefined'

interface ProjectSelectorProps {
  onProjectChange?: (project: Project | null) => void
}

export function ProjectSelector({ onProjectChange }: ProjectSelectorProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [currentProject, setCurrentProject] = useState<Project | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectPath, setNewProjectPath] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load projects on mount
  useEffect(() => {
    loadProjects()
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

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

  function handleAddProject() {
    if (!newProjectName.trim() || !newProjectPath.trim()) {
      alert('Please enter a project name and select a path')
      return
    }

    const newProject = addProject(newProjectName.trim(), newProjectPath.trim())
    setNewProjectName('')
    setNewProjectPath('')
    setShowAddModal(false)
    loadProjects()
    
    // Switch to the new project
    handleSelectProject(newProject)
  }

  function handleFilePicker() {
    fileInputRef.current?.click()
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (files && files.length > 0) {
      // Check if any file is a .beads database or in a .beads directory
      const file = files[0]
      const path = file.webkitRelativePath || file.name
      
      // Extract the parent directory if we selected a file inside .beads
      if (path.includes('.beads')) {
        const beadsIndex = path.indexOf('.beads')
        const projectPath = path.substring(0, beadsIndex - 1)
        setNewProjectPath(projectPath)
        
        // Auto-generate a name from the path
        const pathParts = projectPath.split('/')
        const folderName = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2]
        if (!newProjectName) {
          setNewProjectName(folderName || 'New Project')
        }
      } else {
        // Use the file's directory
        const pathParts = path.split('/')
        pathParts.pop() // Remove filename
        setNewProjectPath(pathParts.join('/'))
        
        if (!newProjectName && pathParts.length > 0) {
          setNewProjectName(pathParts[pathParts.length - 1] || 'New Project')
        }
      }
    }
  }

  function handleManualPathChange(e: React.ChangeEvent<HTMLInputElement>) {
    setNewProjectPath(e.target.value)
  }

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        {/* Current Project Button */}
        <button
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
              <span className="text-sm font-medium text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
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
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute top-full left-0 mt-2 w-72 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
            {/* Header */}
            <div className="px-4 py-3 border-b border-white/10">
              <h3 className="text-sm font-semibold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Projects
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {projects.length} project{projects.length !== 1 ? 's' : ''} configured
              </p>
            </div>

            {/* Project List */}
            <div className="max-h-80 overflow-y-auto">
              {projects.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-white/5 flex items-center justify-center">
                    <svg className="w-6 h-6 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                  </div>
                  <p className="text-sm text-slate-400">No projects yet</p>
                  <p className="text-xs text-slate-500 mt-1">Add your first project to get started</p>
                </div>
              ) : (
                <div className="py-2">
                  {projects.map((project) => (
                    <div
                      key={project.id}
                      className={`relative group flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                        currentProject?.id === project.id
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
                          boxShadow: currentProject?.id === project.id ? `0 0 12px ${project.color}60` : 'none',
                        }}
                      />
                      
                      {/* Project info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate" style={{ fontFamily: 'Outfit, sans-serif' }}>
                          {project.name}
                        </p>
                        <p className="text-xs text-slate-500 truncate" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {project.path}
                        </p>
                      </div>

                      {/* Active indicator */}
                      {currentProject?.id === project.id && (
                        <svg className="w-4 h-4 text-violet-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}

                      {/* Remove button */}
                      <button
                        onClick={(e) => handleRemoveProject(e, project.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-500/20 transition-all"
                      >
                        <svg className="w-4 h-4 text-slate-400 hover:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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
                onClick={() => {
                  setShowAddModal(true)
                  setIsOpen(false)
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 text-white text-sm font-medium hover:shadow-lg hover:shadow-violet-500/25 transition-all duration-300"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Project
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Project Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
              <h2 className="text-lg font-semibold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Add Project
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="px-6 py-5 space-y-5">
              {/* Project Name */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
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
                <label className="block text-sm font-medium text-slate-300 mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  Path to Project
                </label>
                
                {/* File Picker */}
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={newProjectPath}
                    onChange={handleManualPathChange}
                    placeholder="/path/to/project"
                    className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}
                  />
                  <button
                    onClick={handleFilePicker}
                    className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                    title="Browse for project directory"
                  >
                    <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                  </button>
                </div>
                
                {/* Hidden file input for directory picker */}
                <input
                  ref={fileInputRef}
                  type="file"
                  webkitdirectory=""
                  directory=""
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
                
                <p className="text-xs text-slate-500 mt-2">
                  Select the directory containing your <code className="px-1.5 py-0.5 rounded bg-white/5 text-violet-400">.beads</code> folder
                </p>
              </div>

              {/* Info Box */}
              <div className="flex items-start gap-3 p-4 rounded-xl bg-violet-500/10 border border-violet-500/20">
                <svg className="w-5 h-5 text-violet-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm text-slate-300">
                    The project directory should contain a <code className="px-1.5 py-0.5 rounded bg-white/5 text-violet-400">.beads</code> folder with your database.
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Initialize with <code className="px-1.5 py-0.5 rounded bg-white/5 text-slate-400">bd init</code> if needed.
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-6 py-5 border-t border-white/10">
              <button
                onClick={() => setShowAddModal(false)}
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
        </div>
      )}
    </>
  )
}
