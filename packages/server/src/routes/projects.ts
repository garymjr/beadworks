import { Hono } from 'hono'
import {
  getAllProjects,
  addProject,
  updateProject,
  removeProject,
} from '../lib/project-store.js'

export const projectsRoutes = new Hono()

// GET /api/projects - Get all projects
projectsRoutes.get('/', async (c) => {
  try {
    const projects = await getAllProjects()
    return c.json({ projects })
  } catch (error) {
    console.error('Failed to get projects:', error)
    return c.json({ error: 'Failed to get projects' }, 500)
  }
})

// POST /api/projects - Add a new project
projectsRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json()

    // Validate required fields
    if (!body.name || typeof body.name !== 'string') {
      return c.json({ error: 'Project name is required' }, 400)
    }
    if (!body.path || typeof body.path !== 'string') {
      return c.json({ error: 'Project path is required' }, 400)
    }

    const project = await addProject({
      name: body.name,
      path: body.path,
    })

    return c.json({ project }, 201)
  } catch (error) {
    console.error('Failed to add project:', error)
    return c.json({ error: 'Failed to add project' }, 500)
  }
})

// PUT /api/projects/:id - Update a project
projectsRoutes.put('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()

    const project = await updateProject(id, body)

    if (!project) {
      return c.json({ error: 'Project not found' }, 404)
    }

    return c.json({ project })
  } catch (error) {
    console.error('Failed to update project:', error)
    return c.json({ error: 'Failed to update project' }, 500)
  }
})

// DELETE /api/projects/:id - Remove a project
projectsRoutes.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const success = await removeProject(id)

    if (!success) {
      return c.json({ error: 'Project not found' }, 404)
    }

    return c.json({ success: true })
  } catch (error) {
    console.error('Failed to remove project:', error)
    return c.json({ error: 'Failed to remove project' }, 500)
  }
})
