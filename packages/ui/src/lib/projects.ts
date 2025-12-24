// Project management types and utilities
import {
  getProjectsFromAPI,
  addProjectToAPI,
  updateProjectInAPI,
  removeProjectFromAPI,
} from './api/client'

export interface Project {
  id: string
  name: string
  path: string // Path to directory containing .beads
  color: string
  createdAt: string
}

interface ProjectSettings {
  currentProjectId: string | null
}

const STORAGE_KEY = 'beadworks-current-project'

// ============================================================================
// Current Project Selection (localStorage)
// ============================================================================

// Get current project ID from localStorage
export function getCurrentProjectId(): string | null {
  if (typeof window === 'undefined') return null

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored || null
  } catch (error) {
    console.error('Failed to get current project:', error)
    return null
  }
}

// Set current project ID in localStorage
export function setCurrentProjectId(projectId: string | null): void {
  if (typeof window === 'undefined') return

  try {
    if (projectId === null) {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, projectId)
    }
  } catch (error) {
    console.error('Failed to set current project:', error)
  }
}

// ============================================================================
// Projects List (API-based, persisted to ~/.beadworks/projects.json)
// ============================================================================

// Get all projects from the server
export async function getProjects(): Promise<Array<Project>> {
  try {
    const result = await getProjectsFromAPI()
    return result.projects || []
  } catch (error) {
    console.error('Failed to load projects:', error)
    return []
  }
}

// Synchronous version that returns empty array (for compatibility during migration)
// TODO: Remove this once all callers are updated to use async version
export function getProjectsSync(): Array<Project> {
  // This is a temporary fallback during migration
  // In the future, all callers should use the async getProjects()
  return []
}

// Add a new project
export async function addProject(name: string, path: string): Promise<Project> {
  try {
    const result = await addProjectToAPI({ name, path })
    return result.project
  } catch (error) {
    console.error('Failed to add project:', error)
    throw error
  }
}

// Remove a project
export async function removeProject(projectId: string): Promise<void> {
  try {
    await removeProjectFromAPI(projectId)

    // If we removed the current project, clear it from localStorage
    if (getCurrentProjectId() === projectId) {
      // Note: We can't synchronously get the next project anymore
      // The caller should handle fetching the updated list and setting a new current project
      setCurrentProjectId(null)
    }
  } catch (error) {
    console.error('Failed to remove project:', error)
    throw error
  }
}

// Update a project
export async function updateProject(
  projectId: string,
  updates: Partial<Project>,
): Promise<void> {
  try {
    await updateProjectInAPI(projectId, updates)
  } catch (error) {
    console.error('Failed to update project:', error)
    throw error
  }
}

// ============================================================================
// Combined Operations
// ============================================================================

// Get current project (combines localStorage current ID with API projects list)
export async function getCurrentProject(): Promise<Project | null> {
  const currentId = getCurrentProjectId()
  if (!currentId) return null

  const projects = await getProjects()
  return projects.find((p) => p.id === currentId) || null
}

// ============================================================================
// Migration (localStorage → API)
// ============================================================================

interface LegacyProjectSettings {
  currentProjectId: string | null
  projects: Array<Project>
}

const LEGACY_STORAGE_KEY = 'beadworks-projects'

/**
 * Migrate projects from localStorage to the server API
 * Call this once on app startup to move data from localStorage to the file system
 */
export async function migrateProjectsFromLocalStorage(): Promise<number> {
  if (typeof window === 'undefined') return 0

  try {
    const stored = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!stored) return 0

    const legacySettings: LegacyProjectSettings = JSON.parse(stored)
    const projects = legacySettings.projects || []

    if (projects.length === 0) return 0

    // Migrate each project to the server
    let migrated = 0
    for (const project of projects) {
      try {
        await addProjectToAPI({
          name: project.name,
          path: project.path,
        })
        migrated++
      } catch (error) {
        console.error(`Failed to migrate project ${project.id}:`, error)
      }
    }

    // Clear the legacy data after successful migration
    if (migrated === projects.length) {
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    }

    return migrated
  } catch (error) {
    console.error('Failed to migrate projects:', error)
    return 0
  }
}

/**
 * Check if there's legacy data in localStorage that needs migration
 */
export function hasLegacyProjects(): boolean {
  if (typeof window === 'undefined') return false

  try {
    const stored = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!stored) return false

    const legacySettings: LegacyProjectSettings = JSON.parse(stored)
    const projects = legacySettings.projects || []
    return projects.length > 0
  } catch {
    return false
  }
}

// ============================================================================
// Utilities
// ============================================================================

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
