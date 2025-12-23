// Project management types and utilities

export interface Project {
  id: string
  name: string
  path: string // Path to directory containing .beads
  color: string
  createdAt: string
}

export interface ProjectSettings {
  currentProjectId: string | null
  projects: Project[]
}

const STORAGE_KEY = 'beadworks-projects'

// Generate a consistent color for a project
export function getProjectColor(id: string): string {
  const colors = [
    '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#9b59b6', '#ff9ff3',
    '#ff9f43', '#54a0ff', '#5f27cd', '#00d2d3', '#1dd1a1', '#f368e0'
  ]
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

// Get all projects from localStorage
export function getProjects(): Project[] {
  if (typeof window === 'undefined') return []
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    
    const settings: ProjectSettings = JSON.parse(stored)
    return settings.projects || []
  } catch (error) {
    console.error('Failed to load projects:', error)
    return []
  }
}

// Save projects to localStorage
export function saveProjects(projects: Project[]): void {
  if (typeof window === 'undefined') return
  
  try {
    const settings: ProjectSettings = {
      currentProjectId: getCurrentProjectId(),
      projects,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (error) {
    console.error('Failed to save projects:', error)
  }
}

// Get current project ID
export function getCurrentProjectId(): string | null {
  if (typeof window === 'undefined') return null
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    
    const settings: ProjectSettings = JSON.parse(stored)
    return settings.currentProjectId || null
  } catch (error) {
    console.error('Failed to get current project:', error)
    return null
  }
}

// Set current project ID
export function setCurrentProjectId(projectId: string | null): void {
  if (typeof window === 'undefined') return
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    const settings: ProjectSettings = stored ? JSON.parse(stored) : { projects: [] }
    
    settings.currentProjectId = projectId
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (error) {
    console.error('Failed to set current project:', error)
  }
}

// Get current project
export function getCurrentProject(): Project | null {
  if (typeof window === 'undefined') return null
  
  const projects = getProjects()
  const currentId = getCurrentProjectId()
  
  if (!currentId) return null
  
  return projects.find(p => p.id === currentId) || null
}

// Add a new project
export function addProject(name: string, path: string): Project {
  const projects = getProjects()
  const id = `project-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  const newProject: Project = {
    id,
    name,
    path,
    color: getProjectColor(id),
    createdAt: new Date().toISOString(),
  }
  
  projects.push(newProject)
  saveProjects(projects)
  
  return newProject
}

// Remove a project
export function removeProject(projectId: string): void {
  const projects = getProjects().filter(p => p.id !== projectId)
  saveProjects(projects)
  
  // If we removed the current project, clear it
  if (getCurrentProjectId() === projectId) {
    const nextProject = projects[0]
    setCurrentProjectId(nextProject?.id || null)
  }
}

// Update a project
export function updateProject(projectId: string, updates: Partial<Project>): void {
  const projects = getProjects()
  const index = projects.findIndex(p => p.id === projectId)
  
  if (index !== -1) {
    projects[index] = { ...projects[index], ...updates }
    saveProjects(projects)
  }
}

// Validate a project path (check if it has a .beads directory)
export async function validateProjectPath(path: string): Promise<boolean> {
  try {
    // This would need to be validated server-side
    // For now, we'll just check if it's not empty
    return path.length > 0
  } catch {
    return false
  }
}
