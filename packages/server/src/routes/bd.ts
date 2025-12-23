import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import * as bd from "../lib/bd-cli.js";

const bdRoutes = new Hono();

// ============================================================================
// Issues
// ============================================================================

/**
 * GET /api/bd/issues
 * List issues with optional filters
 */
bdRoutes.get("/issues", async (c) => {
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
  });

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
  const data = c.req.valid("json");
  try {
    const issue = await bd.createIssue(data);
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
    const id = c.req.param("id");
    const data = c.req.valid("json");
    try {
      const issue = await bd.updateIssue(id, data);
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
  const id = c.req.param("id");
  try {
    const result = await bd.closeIssue(id);
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
  const id = c.req.param("id");
  try {
    const result = await bd.reopenIssue(id);
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
  const id = c.req.param("id");
  try {
    const result = await bd.deleteIssue(id);
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

export { bdRoutes };
