import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import * as bd from "../lib/bd-cli.js";

const bdRoutes = new Hono();

// ============================================================================
// Project Management
// ============================================================================

/**
 * GET /api/bd/check-initialized
 * Check if a project has a .beads database
 */
bdRoutes.get("/check-initialized", async (c) => {
  const projectPath = c.req.query("project_path");
  if (!projectPath) {
    return c.json({ error: "project_path query parameter is required" }, 400);
  }

  const isInitialized = bd.isBeadsInitialized(projectPath);
  return c.json({ initialized: isInitialized, path: projectPath });
});

/**
 * POST /api/bd/init
 * Initialize a new beads database in a project directory
 */
const initSchema = z.object({
  project_path: z.string(),
});

bdRoutes.post("/init", zValidator("json", initSchema), async (c) => {
  const { project_path } = c.req.valid("json");
  try {
    const result = await bd.initBeads(project_path);
    return c.json({ success: true, ...result });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// ============================================================================
// Issues
// ============================================================================

// Helper to get database path from request
function getDbPath(c: any): string | undefined {
  // Check for project_path query parameter
  const projectPath = c.req.query("project_path");
  if (projectPath) {
    return projectPath;
  }
  
  // Check for X-Project-Path header
  const headerPath = c.req.header("X-Project-Path");
  if (headerPath) {
    return headerPath;
  }
  
  // Default to undefined (uses BEADS_DIR env var or auto-discovery)
  return undefined;
}

// ============================================================================
// Issues
// ============================================================================

/**
 * GET /api/bd/issues
 * List issues with optional filters
 */
bdRoutes.get("/issues", async (c) => {
  const dbPath = getDbPath(c);
  const status = c.req.query("status");
  const type = c.req.query("type");
  const assignee = c.req.query("assignee");
  const priority = c.req.query("priority");
  const labels = c.req.queries("labels");
  const limit = c.req.query("limit");
  const sort = c.req.query("sort");
  const reverse = c.req.query("reverse") === "true";

  const issues = await bd.listIssues({
    status,
    type,
    assignee,
    priority,
    labels,
    limit: limit ? parseInt(limit, 10) : undefined,
    sort,
    reverse,
  }, dbPath);

  return c.json(issues);
});

/**
 * GET /api/bd/issues/:id
 * Get a single issue by ID
 */
bdRoutes.get("/issues/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const issue = await bd.showIssue(id);
    return c.json(issue);
  } catch (error: any) {
    return c.json({ error: error.message }, 404);
  }
});

/**
 * POST /api/bd/issues
 * Create a new issue
 */
const createIssueSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(["bug", "feature", "task", "epic", "chore"]).optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  assignee: z.string().optional(),
  labels: z.array(z.string()).optional(),
  estimate: z.number().optional(),
  acceptance: z.string().optional(),
  design: z.string().optional(),
  externalRef: z.string().optional(),
  parent: z.string().optional(),
  deps: z.array(z.string()).optional(),
});

bdRoutes.post("/issues", zValidator("json", createIssueSchema), async (c) => {
  const dbPath = getDbPath(c);
  const data = c.req.valid("json");
  try {
    const issue = await bd.createIssue(data, dbPath);
    return c.json(issue, 201);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * PATCH /api/bd/issues/:id
 * Update an issue
 */
const updateIssueSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  type: z.enum(["bug", "feature", "task", "epic", "chore"]).optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  assignee: z.string().optional(),
  addLabels: z.array(z.string()).optional(),
  removeLabels: z.array(z.string()).optional(),
  setLabels: z.array(z.string()).optional(),
  estimate: z.number().optional(),
  acceptance: z.string().optional(),
  design: z.string().optional(),
  externalRef: z.string().optional(),
  notes: z.string().optional(),
});

bdRoutes.patch(
  "/issues/:id",
  zValidator("json", updateIssueSchema),
  async (c) => {
    const dbPath = getDbPath(c);
    const id = c.req.param("id");
    const data = c.req.valid("json");
    try {
      const issue = await bd.updateIssue(id, data, dbPath);
      return c.json(issue);
    } catch (error: any) {
      return c.json({ error: error.message }, 400);
    }
  }
);

/**
 * POST /api/bd/issues/:id/close
 * Close an issue
 */
bdRoutes.post("/issues/:id/close", async (c) => {
  const dbPath = getDbPath(c);
  const id = c.req.param("id");
  try {
    const result = await bd.closeIssue(id, dbPath);
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * POST /api/bd/issues/:id/reopen
 * Reopen an issue
 */
bdRoutes.post("/issues/:id/reopen", async (c) => {
  const dbPath = getDbPath(c);
  const id = c.req.param("id");
  try {
    const result = await bd.reopenIssue(id, dbPath);
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * DELETE /api/bd/issues/:id
 * Delete an issue
 */
bdRoutes.delete("/issues/:id", async (c) => {
  const dbPath = getDbPath(c);
  const id = c.req.param("id");
  try {
    const result = await bd.deleteIssue(id, dbPath);
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// ============================================================================
// Comments
// ============================================================================

/**
 * GET /api/bd/issues/:id/comments
 * Get comments for an issue
 */
bdRoutes.get("/issues/:id/comments", async (c) => {
  const id = c.req.param("id");
  try {
    const comments = await bd.getComments(id);
    return c.json(comments);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * POST /api/bd/issues/:id/comments
 * Add a comment to an issue
 */
const addCommentSchema = z.object({
  comment: z.string().min(1),
});

bdRoutes.post(
  "/issues/:id/comments",
  zValidator("json", addCommentSchema),
  async (c) => {
    const id = c.req.param("id");
    const { comment } = c.req.valid("json");
    try {
      const result = await bd.addComment(id, comment);
      return c.json(result);
    } catch (error: any) {
      return c.json({ error: error.message }, 400);
    }
  }
);

// ============================================================================
// Dependencies
// ============================================================================

/**
 * POST /api/bd/issues/:id/deps
 * Add a dependency to an issue
 */
const addDepSchema = z.object({
  dep: z.string().min(1),
});

bdRoutes.post(
  "/issues/:id/deps",
  zValidator("json", addDepSchema),
  async (c) => {
    const id = c.req.param("id");
    const { dep } = c.req.valid("json");
    try {
      const result = await bd.addDep(id, dep);
      return c.json(result);
    } catch (error: any) {
      return c.json({ error: error.message }, 400);
    }
  }
);

/**
 * DELETE /api/bd/issues/:id/deps/:depId
 * Remove a dependency from an issue
 */
bdRoutes.delete("/issues/:id/deps/:depId", async (c) => {
  const id = c.req.param("id");
  const depId = c.req.param("depId");
  try {
    const result = await bd.removeDep(id, depId);
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// ============================================================================
// Queries & Search
// ============================================================================

/**
 * GET /api/bd/search
 * Search issues
 */
bdRoutes.get("/search", async (c) => {
  const query = c.req.query("q");
  if (!query) {
    return c.json({ error: "Query parameter 'q' is required" }, 400);
  }
  try {
    const results = await bd.searchIssues(query);
    return c.json(results);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * GET /api/bd/blocked
 * Get blocked issues
 */
bdRoutes.get("/blocked", async (c) => {
  try {
    const issues = await bd.getBlockedIssues();
    return c.json(issues);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * GET /api/bd/ready
 * Get ready issues (no blockers)
 */
bdRoutes.get("/ready", async (c) => {
  try {
    const issues = await bd.getReadyIssues();
    return c.json(issues);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * GET /api/bd/stale
 * Get stale issues
 */
bdRoutes.get("/stale", async (c) => {
  try {
    const issues = await bd.getStaleIssues();
    return c.json(issues);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// ============================================================================
// Statistics & Info
// ============================================================================

/**
 * GET /api/bd/stats
 * Get statistics
 */
bdRoutes.get("/stats", async (c) => {
  try {
    const stats = await bd.getStats();
    return c.json(stats);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * GET /api/bd/status
 * Get status overview
 */
bdRoutes.get("/status", async (c) => {
  try {
    const status = await bd.getStatus();
    return c.json(status);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * GET /api/bd/info
 * Get database info
 */
bdRoutes.get("/info", async (c) => {
  try {
    const info = await bd.getInfo();
    return c.json(info);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// ============================================================================
// Labels
// ============================================================================

/**
 * GET /api/bd/labels
 * Get all labels
 */
bdRoutes.get("/labels", async (c) => {
  try {
    const labels = await bd.getLabels();
    return c.json(labels);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// ============================================================================
// Repositories/Projects
// ============================================================================

/**
 * GET /api/bd/repos
 * List repositories/projects
 */
bdRoutes.get("/repos", async (c) => {
  try {
    const repos = await bd.listRepos();
    return c.json(repos);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// ============================================================================
// AI-powered task generation
// ============================================================================

/**
 * POST /api/bd/generate-task
 * Generate title and labels from a description using the pi-agent
 */
const generateTaskSchema = z.object({
  description: z.string().min(1, "Description is required"),
  type: z.enum(["bug", "feature", "task", "epic", "chore"]).optional(),
});

bdRoutes.post("/generate-task", zValidator("json", generateTaskSchema), async (c) => {
  const { description, type = "task" } = c.req.valid("json");

  try {
    // Import pi-agent
    const { getPiAgentSession } = await import("../lib/pi-agent.js");
    const session = getPiAgentSession();

    if (!session) {
      return c.json({ error: "Pi-agent session not initialized" }, 500);
    }

    // Create a prompt to generate title and labels
    const prompt = `You are a task management assistant. Based on the following description, generate a concise title and relevant labels.

Description: "${description}"
Type: ${type}

Respond with a JSON object in the following format (no markdown, no explanation):
{
  "title": "concise title (max 80 chars)",
  "labels": ["label1", "label2", "label3"]
}

Guidelines for title:
- Be concise and action-oriented
- Start with a verb if it's a task or feature
- Max 80 characters
- Should clearly communicate what the issue is about

Guidelines for labels:
- Generate 3-5 relevant labels
- Use lowercase with hyphens for multi-word labels
- Common labels: frontend, backend, database, api, ui, bug, feature, enhancement, refactor, tests, docs
- Include technology-specific labels if applicable (e.g., typescript, react, postgres)
- Include priority-related labels if the issue seems urgent (e.g., urgent, high-priority)

Respond ONLY with the JSON object, nothing else.`;

    // Subscribe to capture the response
    let fullResponse = "";
    let agentComplete = false;

    const unsubscribe = session.subscribe((event) => {
      if (event.type === "message_update") {
        const msgEvent = event.assistantMessageEvent;
        if (msgEvent.type === "text_delta") {
          fullResponse += msgEvent.delta;
        }
      } else if (event.type === "agent_end") {
        agentComplete = true;
      }
    });

    // Send prompt and wait for response
    await session.prompt(prompt);

    // Wait for the agent to complete processing
    const maxWaitTime = 30000; // 30 seconds max
    const startTime = Date.now();
    while (!agentComplete && Date.now() - startTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    unsubscribe();

    if (!agentComplete) {
      console.warn("Agent did not complete in time, using partial response");
    }

    // Try to parse the response as JSON
    let parsed;
    try {
      // Clean up the response - remove any markdown code blocks
      const cleaned = fullResponse
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();

      parsed = JSON.parse(cleaned);
    } catch (parseError) {
      console.error("Failed to parse AI response:", fullResponse);
      // Fallback: extract from the description
      parsed = {
        title: description.split("\n")[0].substring(0, 80),
        labels: ["ai-generated"]
      };
    }

    return c.json({
      title: parsed.title || description.substring(0, 80),
      labels: parsed.labels || []
    });
  } catch (error: any) {
    console.error("Failed to generate task:", error);
    return c.json({ error: error.message }, 500);
  }
});

export { bdRoutes };
