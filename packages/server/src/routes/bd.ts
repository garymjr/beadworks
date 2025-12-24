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
 * GET /api/bd/issues/:id/subtasks
 * Get subtasks for a parent issue
 */
bdRoutes.get("/issues/:id/subtasks", async (c) => {
  const dbPath = getDbPath(c);
  const id = c.req.param("id");
  try {
    // Get all issues and filter by parent
    const allIssues = await bd.listIssues(undefined, dbPath);
    const subtasks = allIssues.filter((issue: any) => issue.parent === id);

    // Calculate progress
    const total = subtasks.length;
    const completed = subtasks.filter((st: any) => st.status === "closed").length;

    return c.json({
      subtasks,
      progress: {
        total,
        completed,
        percent: total > 0 ? Math.round((completed / total) * 100) : 0,
      },
    });
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
// Cleanup
// ============================================================================

/**
 * POST /api/bd/cleanup
 * Delete all closed issues
 */
const cleanupSchema = z.object({
  older_than_days: z.number().optional(),
});

bdRoutes.post("/cleanup", zValidator("json", cleanupSchema), async (c) => {
  const dbPath = getDbPath(c);
  const { older_than_days } = c.req.valid("json");
  
  try {
    const result = await bd.cleanupClosedIssues(dbPath, older_than_days);
    return c.json(result);
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
 * POST /api/bd/generate-plan
 * Generate a plan with subtasks for an issue using the pi-agent
 */
const generatePlanSchema = z.object({
  issue_id: z.string().min(1, "Issue ID is required"),
  project_path: z.string().optional(),
});

bdRoutes.post("/generate-plan", zValidator("json", generatePlanSchema), async (c) => {
  const { issue_id, project_path } = c.req.valid("json");

  try {
    // Import pi-agent
    const { getPiAgentSession } = await import("../lib/pi-agent.js");
    const session = getPiAgentSession();

    if (!session) {
      return c.json({ error: "Pi-agent session not initialized" }, 500);
    }

    // Get the issue details
    const issueResult = await bd.showIssue(issue_id, project_path);
    if (!issueResult) {
      return c.json({ error: "Issue not found" }, 404);
    }

    // bd.showIssue returns an array, get the first element
    const issue = Array.isArray(issueResult) ? issueResult[0] : issueResult;

    // Log the issue for debugging
    console.log(`[generate-plan] Issue data:`, JSON.stringify(issue, null, 2));

    // Extract issue properties safely
    const issueTitle = issue.title || issue.Title || issue.subject || "Unknown Issue";
    const issueDescription = issue.description || issue.Description || issue.body || issue.content || "";
    const issueType = issue.type || issue.issue_type || issue.Type || "task";
    const issueLabels = issue.labels || issue.Labels || [];

    // Check if the issue already has an AI-generated plan
    const hasPlanLabel = issueLabels.includes("ai-plan-generated");
    if (hasPlanLabel) {
      return c.json({ error: "Plan already generated for this issue", issue }, 400);
    }

    // Get existing comments to check for AI-generated plan
    try {
      const comments = await bd.getComments(issue_id, project_path);
      const hasPlanComment = comments?.some((comment: any) =>
        comment.content?.includes("🤖 AI-Generated Plan")
      );
      if (hasPlanComment) {
        return c.json({ error: "Plan already generated for this issue", issue }, 400);
      }
    } catch (e) {
      // No comments or error getting comments - proceed
    }

    // Create a prompt to generate a plan with subtasks
    const prompt = `You are a senior software engineer and technical lead. Your job is to break down the following issue into concrete implementation steps.

THE ISSUE TO IMPLEMENT:
Title: ${issueTitle}
Description: ${issueDescription || "No description"}
Type: ${issueType}
Labels: ${issueLabels.join(", ") || "none"}

IMPORTANT CONTEXT:
- This is a REAL issue that needs to be IMPLEMENTED
- Do NOT generate tasks about "planning" or "creating subtasks"
- Generate ACTUAL implementation steps that a developer would execute
- Each subtask should represent actual code to write, tests to write, or files to modify

Break this down into 3-8 specific implementation steps. Think about:
- What files need to be created or modified?
- What functions or components need to be written?
- What tests need to be added?
- Are there any configuration changes needed?
- Should there be a data migration or schema change?
- What about error handling and edge cases?

Respond with a JSON object in the following format (no markdown, no explanation):
{
  "plan": "Brief technical approach (2-3 sentences explaining the overall strategy)",
  "subtasks": [
    {
      "title": "Implementation step title (e.g., 'Create user authentication API endpoint' or 'Add error handling to payment processor')",
      "description": "Specific technical details - what files to modify, what functions to create, etc.",
      "type": "task|bug|chore"
    }
  ],
  "risks": ["Potential technical risks, edge cases to consider, or things that might go wrong"]
}

EXAMPLE OF GOOD SUBTASKS:
- "Create REST API endpoint for user registration" → "Add POST /api/users/register route in src/routes/users.ts. Implement input validation, password hashing with bcrypt, and user creation. Return 201 with user object or 400 for validation errors."
- "Add unit tests for payment processing" → "Create test file src/services/payment.test.ts. Add tests for successful payment, failed payment, and edge cases like insufficient funds. Use jest mock for Stripe API."

EXAMPLE OF BAD SUBTASKS (avoid these):
- "Create subtasks for this issue"
- "Plan the implementation approach"
- "Research the best way to implement"

Remember: These are REAL implementation steps. Each subtask should be something a developer sits down and codes.

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
    const maxWaitTime = 60000; // 60 seconds max for plan generation
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
      return c.json({ error: "Failed to generate plan - AI response could not be parsed" }, 500);
    }

    // Add the plan as a comment
    const planComment = `🤖 AI-Generated Plan

${parsed.plan || "No plan summary provided"}

**Subtasks:**
${parsed.subtasks?.map((st: any, i: number) => `${i + 1}. **${st.title}** - ${st.description || "No description"}`).join("\n") || "No subtasks"}

**Risks & Considerations:**
${parsed.risks?.map((r: string) => `- ${r}`).join("\n") || "None identified"}
`;

    await bd.addComment(issue_id, planComment, project_path);

    // Add label to mark that plan was generated
    await bd.updateIssue(issue_id, {
      addLabels: ["ai-plan-generated"],
    }, project_path);

    // Create subtasks
    const createdSubtasks = [];
    if (parsed.subtasks && Array.isArray(parsed.subtasks)) {
      for (const subtask of parsed.subtasks) {
        try {
          const newIssue = await bd.createIssue({
            title: subtask.title,
            description: subtask.description || "",
            type: subtask.type || "task",
            parent: issue_id,
          }, project_path);

          createdSubtasks.push(newIssue);
        } catch (createError) {
          console.error("Failed to create subtask:", createError);
        }
      }
    }

    // Get updated issue
    const updatedIssue = await bd.showIssue(issue_id, project_path);

    return c.json({
      success: true,
      issue: updatedIssue,
      subtasks: createdSubtasks,
      plan: parsed,
    });
  } catch (error: any) {
    console.error("Failed to generate plan:", error);
    return c.json({ error: error.message }, 500);
  }
});

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
