import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

// Project types
export interface Project {
  id: string
  name: string
  path: string
  color: string
  createdAt: string
}

export interface ProjectsData {
  projects: Array<Project>
}

// Storage configuration
const BEADWORKS_DIR = join(homedir(), '.beadworks')
const PROJECTS_FILE = join(BEADWORKS_DIR, 'projects.json')

// Ensure the beadworks directory exists
async function ensureDirectory(): Promise<void> {
  if (!existsSync(BEADWORKS_DIR)) {
    await mkdir(BEADWORKS_DIR, { recursive: true })
  }
}

// Initialize with empty data if file doesn't exist
async function initializeIfMissing(): Promise<void> {
  await ensureDirectory()
  if (!existsSync(PROJECTS_FILE)) {
    const emptyData: ProjectsData = { projects: [] }
    await writeFile(PROJECTS_FILE, JSON.stringify(emptyData, null, 2), 'utf-8')
  }
}

// Read projects from file
export async function readProjects(): Promise<ProjectsData> {
  await initializeIfMissing()

  try {
    const content = await readFile(PROJECTS_FILE, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    console.error('Failed to read projects file:', error)
    return { projects: [] }
  }
}

// Write projects to file (atomic write for safety)
export async function writeProjects(data: ProjectsData): Promise<void> {
  await ensureDirectory()

  const tempFile = `${PROJECTS_FILE}.tmp`
  const content = JSON.stringify(data, null, 2)

  try {
    // Write to temp file first
    await writeFile(tempFile, content, 'utf-8')
    // Atomic rename
    await rename(tempFile, PROJECTS_FILE)
  } catch (error) {
    console.error('Failed to write projects file:', error)
    throw error
  }
}

// Get all projects
export async function getAllProjects(): Promise<Array<Project>> {
  const data = await readProjects()
  return data.projects
}

// Add a new project
export async function addProject(project: Omit<Project, 'id' | 'color' | 'createdAt'>): Promise<Project> {
  const data = await readProjects()

  const id = `project-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  const color = getProjectColor(id)
  const createdAt = new Date().toISOString()

  const newProject: Project = {
    id,
    name: project.name,
    path: project.path,
    color,
    createdAt,
  }

  data.projects.push(newProject)
  await writeProjects(data)

  return newProject
}

// Update a project
export async function updateProject(id: string, updates: Partial<Omit<Project, 'id'>>): Promise<Project | null> {
  const data = await readProjects()
  const index = data.projects.findIndex((p) => p.id === id)

  if (index === -1) {
    return null
  }

  data.projects[index] = { ...data.projects[index], ...updates }
  await writeProjects(data)

  return data.projects[index]
}

// Remove a project
export async function removeProject(id: string): Promise<boolean> {
  const data = await readProjects()
  const initialLength = data.projects.length

  data.projects = data.projects.filter((p) => p.id !== id)

  if (data.projects.length === initialLength) {
    return false // Project not found
  }

  await writeProjects(data)
  return true
}

// Generate a consistent color for a project
function getProjectColor(id: string): string {
  const colors = [
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
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}
