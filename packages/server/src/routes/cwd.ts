import { Hono } from 'hono'

export const cwdRoutes = new Hono()

// Get the current working directory of the server
// This is useful for auto-detecting the project path
cwdRoutes.get('/api/cwd', (c) => {
  const cwd = process.cwd()

  // Extract the project name from the path
  const pathParts = cwd.split('/')
  const projectName = pathParts[pathParts.length - 1] || 'beadworks'

  return c.json({
    path: cwd,
    name: projectName,
  })
})
