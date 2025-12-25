import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import * as bd from "../lib/bd-cli.js";
import JSON5 from "json5";

/**
 * Clean and fix common JSON syntax errors in AI responses
 * This handles cases where the LLM generates malformed JSON
 */
function cleanJsonString(jsonStr: string): string {
  let cleaned = jsonStr;

  // Remove server log markers that may have been embedded in AI responses
  cleaned = cleaned.replace(/\[SERVER\]/g, '');
  cleaned = cleaned.replace(/^\[SERVER\]\s*/gm, '');
  cleaned = cleaned.replace(/\s*\[SERVER\]\s*/g, ' ');

  // Remove any control characters that might break JSON (except newline/tab which are OK in JSON whitespace)
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Fix smart/curly quotes to regular straight quotes
  cleaned = cleaned.replace(/[\u201C\u201D]/g, '"');  // Left/right double quotes
  cleaned = cleaned.replace(/[\u2018\u2019]/g, "'");  // Left/right single quotes

  // Fix unquoted property names: title: → "title":
  // Only match after { or , to avoid matching inside strings
  cleaned = cleaned.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3');

  // Remove trailing commas before closing brackets/braces
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  // Fix single-quoted values to double-quoted
  cleaned = cleaned.replace(/:\s*'([^']*?)'/g, ': "$1"');

  // Attempt to fix unescaped quotes in string values
  // Pattern: looks for "text": "value with "quote" inside"
  // We'll escape quotes that appear to be inside string values
  // This regex finds: "value" followed by non-whitespace and non-closing chars, then "
  cleaned = cleaned.replace(/:"([^"]*)"([^{,}\]]*)"([,}\]])/g, (match, prefix, middle, suffix) => {
    // Escape any quotes in the middle part
    const escapedMiddle = middle.replace(/"/g, '\\"');
    return `:"${prefix}${escapedMiddle}"${suffix}`;
  });

  return cleaned;
}

/**
 * Extract a valid JSON object from a string that may contain extra text
 * Uses brace matching to find the complete outermost object
 */
function extractJsonObject(str: string): string | null {
  const startIndex = str.indexOf('{');
  if (startIndex === -1) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let endIndex = -1;

  for (let i = startIndex; i < str.length; i++) {
    const char = str[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          endIndex = i;
          break;
        }
      }
    }
  }

  if (endIndex > startIndex) {
    return str.slice(startIndex, endIndex + 1);
  }

  return null;
}

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

    // Filter subtasks - bd uses dot notation for subtasks (e.g., "server-d98.6" is a subtask of "server-d98")
    // Check for parent field first (if bd adds it in the future), then fall back to ID pattern matching
    const subtasks = allIssues.filter((issue: any) => {
      // If there's an explicit parent field, use it
      if (issue.parent === id) return true;

      // Otherwise, check if the issue ID starts with the parent ID followed by a dot
      // e.g., "server-d98.6" is a subtask of "server-d98"
      return issue.id.startsWith(`${id}.`);
    });

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

    // Check if the issue already has subtasks
    try {
      const { subtasks } = await bd.getSubtasks(issue_id, project_path);
      if (subtasks && subtasks.length > 0) {
        return c.json({ error: "Issue already has subtasks", issue }, 400);
      }
    } catch (e) {
      // No subtasks or error getting them - proceed
    }

    // Create a prompt to generate a plan with subtasks
    const prompt = `<INSTRUCTIONS>
You are a senior software engineer and technical lead. Your job is to break down the following issue into concrete implementation steps.
</INSTRUCTIONS>

<TASK>
Break down this issue into 3-8 specific implementation steps. Think about:
- What files need to be created or modified?
- What functions or components need to be written?
- What tests need to be added?
- Are there any configuration changes needed?
- Should there be a data migration or schema change?
- What about error handling and edge cases?
</TASK>

<ISSUE>
Title: ${issueTitle}
Description: ${issueDescription || "No description"}
Type: ${issueType}
Labels: ${issueLabels.join(", ") || "none"}
</ISSUE>

<CONSTRAINTS>
- This is a REAL issue that needs to be IMPLEMENTED
- Do NOT generate meta-tasks like "create subtasks" or "plan implementation"
- Generate ACTUAL implementation steps that a developer would execute
- Each subtask should represent actual code to write, tests to write, or files to modify
- Avoid using single quotes in descriptions - use double quotes or rephrase
- Keep all descriptions on one logical line (no embedded newlines)
- Do not use markdown code blocks within JSON strings
</CONSTRAINTS>

<EXAMPLES>
GOOD subtask title: "Create REST API endpoint for user registration"
GOOD subtask description: "Add POST /api/users/register route in src/routes/users.ts. Implement input validation, password hashing with bcrypt, and user creation. Return 201 with user object or 400 for validation errors."

GOOD subtask title: "Add unit tests for payment processing"
GOOD subtask description: "Create test file src/services/payment.test.ts. Add tests for successful payment, failed payment, and edge cases like insufficient funds. Use jest mock for Stripe API."

BAD subtask titles: "Create subtasks for this issue", "Plan the implementation approach", "Research the best way to implement"
</EXAMPLES>

<OUTPUT_FORMAT>
Respond ONLY with valid JSON. No markdown. No explanation. No preamble.
Use this exact structure:

{
  "plan": "Brief technical strategy in 2-3 sentences. Avoid special characters.",
  "subtasks": [
    {
      "title": "Action-oriented title starting with a verb",
      "description": "Specific technical details with file paths and implementation notes. Use double quotes for paths, not single quotes. Avoid embedded newlines.",
      "type": "task"
    }
  ],
  "risks": ["Risk 1", "Risk 2", "Risk 3"]
}

CRITICAL JSON REQUIREMENTS:
- All string values must use double quotes, never single quotes
- Escape any double quotes inside strings with backslash: \\"
- Do not include markdown formatting (no \`code blocks\`)
- Do not use smart quotes (curly quotes)
- Ensure all brackets, braces, and quotes are balanced
- End with a closing brace }
</OUTPUT_FORMAT>`;

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
      // Handle various formats: ```json ... ```, ``` ... ```, or plain JSON
      let cleaned = fullResponse.trim();

      // Remove markdown code blocks
      const openingMatch = cleaned.match(/```\w*\s*\r?\n/);
      if (openingMatch) {
        cleaned = cleaned.slice(openingMatch[0].length);
      }

      const closingMatch = cleaned.match(/```\s*$/);
      if (closingMatch) {
        cleaned = cleaned.slice(0, closingMatch.index);
      }

      cleaned = cleaned.trim();

      // Apply JSON cleaning BEFORE extraction to remove server log markers
      cleaned = cleanJsonString(cleaned);

      // Extract JSON object using the helper function
      const extracted = extractJsonObject(cleaned);
      if (extracted) {
        cleaned = extracted;
      }

      cleaned = cleaned.trim();

      // Apply JSON cleaning again AFTER extraction for any remaining syntax fixes
      cleaned = cleanJsonString(cleaned);

      // Try strict JSON parsing first
      try {
        parsed = JSON.parse(cleaned);
      } catch (strictError: any) {
        // If strict parsing fails, try JSON5 which is more lenient
        console.warn("Strict JSON parsing failed, trying JSON5:", strictError?.message || strictError);
        try {
          parsed = JSON5.parse(cleaned);
        } catch (json5Error: any) {
          // Both failed, throw the original error with context
          throw new Error(`JSON parse failed: ${strictError?.message || strictError}. JSON5 also failed: ${json5Error?.message || json5Error}`);
        }
      }
    } catch (parseError: any) {
      console.error("Failed to parse AI response:", parseError);
      console.error("Response content:", fullResponse);
      return c.json({ error: "Failed to generate plan - AI response could not be parsed" }, 500);
    }

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
 * POST /api/bd/generate-and-start
 * Generate subtasks for an issue and then immediately start work on it
 */
const generateAndStartSchema = z.object({
  issue_id: z.string().min(1, "Issue ID is required"),
  project_path: z.string().optional(),
  timeout: z.number().optional(),
});

bdRoutes.post("/generate-and-start", zValidator("json", generateAndStartSchema), async (c) => {
  const { issue_id, project_path, timeout } = c.req.valid("json");

  try {
    // Import pi-agent and work manager
    const { getPiAgentSession } = await import("../lib/pi-agent.js");
    const { startWorkOnIssue } = await import("../lib/agent-work-manager.js");
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

    // Extract issue properties safely
    const issueTitle = issue.title || issue.Title || issue.subject || "Unknown Issue";
    const issueDescription = issue.description || issue.Description || issue.body || issue.content || "";
    const issueType = issue.type || issue.issue_type || issue.Type || "task";
    const issueLabels = issue.labels || issue.Labels || [];

    // Check if the issue already has subtasks
    try {
      const { subtasks } = await bd.getSubtasks(issue_id, project_path);
      if (subtasks && subtasks.length > 0) {
        console.log(`[generate-and-start] Issue ${issue_id} already has ${subtasks.length} subtasks, skipping generation`);
        // Already has subtasks, just start work
        const result = await startWorkOnIssue(issue_id, {
          projectPath: project_path,
          timeout,
        });

        return c.json({
          success: true,
          subtasksGenerated: false,
          existingSubtasks: subtasks,
          ...result,
        });
      }
    } catch (e) {
      // No subtasks or error getting them - proceed to generate
    }

    // Create a prompt to generate a plan with subtasks
    const prompt = `<INSTRUCTIONS>
You are a senior software engineer and technical lead. Your job is to break down the following issue into concrete implementation steps.
</INSTRUCTIONS>

<TASK>
Break down this issue into 3-8 specific implementation steps. Think about:
- What files need to be created or modified?
- What functions or components need to be written?
- What tests need to be added?
- Are there any configuration changes needed?
- Should there be a data migration or schema change?
- What about error handling and edge cases?
</TASK>

<ISSUE>
Title: ${issueTitle}
Description: ${issueDescription || "No description"}
Type: ${issueType}
Labels: ${issueLabels.join(", ") || "none"}
</ISSUE>

<CONSTRAINTS>
- This is a REAL issue that needs to be IMPLEMENTED
- Do NOT generate meta-tasks like "create subtasks" or "plan implementation"
- Generate ACTUAL implementation steps that a developer would execute
- Each subtask should represent actual code to write, tests to write, or files to modify
- Avoid using single quotes in descriptions - use double quotes or rephrase
- Keep all descriptions on one logical line (no embedded newlines)
- Do not use markdown code blocks within JSON strings
</CONSTRAINTS>

<EXAMPLES>
GOOD subtask title: "Create REST API endpoint for user registration"
GOOD subtask description: "Add POST /api/users/register route in src/routes/users.ts. Implement input validation, password hashing with bcrypt, and user creation. Return 201 with user object or 400 for validation errors."

GOOD subtask title: "Add unit tests for payment processing"
GOOD subtask description: "Create test file src/services/payment.test.ts. Add tests for successful payment, failed payment, and edge cases like insufficient funds. Use jest mock for Stripe API."

BAD subtask titles: "Create subtasks for this issue", "Plan the implementation approach", "Research the best way to implement"
</EXAMPLES>

<OUTPUT_FORMAT>
Respond ONLY with valid JSON. No markdown. No explanation. No preamble.
Use this exact structure:

{
  "plan": "Brief technical strategy in 2-3 sentences. Avoid special characters.",
  "subtasks": [
    {
      "title": "Action-oriented title starting with a verb",
      "description": "Specific technical details with file paths and implementation notes. Use double quotes for paths, not single quotes. Avoid embedded newlines.",
      "type": "task"
    }
  ],
  "risks": ["Risk 1", "Risk 2", "Risk 3"]
}

CRITICAL JSON REQUIREMENTS:
- All string values must use double quotes, never single quotes
- Escape any double quotes inside strings with backslash: \\"
- Do not include markdown formatting (no \`code blocks\`)
- Do not use smart quotes (curly quotes)
- Ensure all brackets, braces, and quotes are balanced
- End with a closing brace }
</OUTPUT_FORMAT>`;

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
    let cleaned = '';
    try {
      // Clean up the response - remove any markdown code blocks
      cleaned = fullResponse.trim();

      // Remove markdown code blocks
      const openingMatch = cleaned.match(/```\w*\s*\r?\n/);
      if (openingMatch) {
        cleaned = cleaned.slice(openingMatch[0].length);
      }

      const closingMatch = cleaned.match(/```\s*$/);
      if (closingMatch) {
        cleaned = cleaned.slice(0, closingMatch.index);
      }

      cleaned = cleaned.trim();

      // Apply JSON cleaning BEFORE extraction to remove server log markers
      cleaned = cleanJsonString(cleaned);

      // Extract JSON object using the helper function
      const extracted = extractJsonObject(cleaned);
      if (extracted) {
        cleaned = extracted;
      }

      cleaned = cleaned.trim();

      // Apply JSON cleaning again AFTER extraction for any remaining syntax fixes
      cleaned = cleanJsonString(cleaned);

      // Try strict JSON parsing first
      try {
        parsed = JSON.parse(cleaned);
      } catch (strictError: any) {
        // If strict parsing fails, try JSON5 which is more lenient
        console.warn("Strict JSON parsing failed, trying JSON5:", strictError?.message || strictError);
        try {
          parsed = JSON5.parse(cleaned);
        } catch (json5Error: any) {
          // Both failed, throw the original error with context
          throw new Error(`JSON parse failed: ${strictError?.message || strictError}. JSON5 also failed: ${json5Error?.message || json5Error}`);
        }
      }
    } catch (parseError: any) {
      console.error("Failed to parse AI response:", parseError);
      console.error("Response content:", fullResponse);
      console.error("Cleaned content:", cleaned);
      return c.json({ error: "Failed to generate plan - AI response could not be parsed" }, 500);
    }

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

    console.log(`[generate-and-start] Generated ${createdSubtasks.length} subtasks for issue ${issue_id}, starting work...`);

    // Start work on the issue
    const workResult = await startWorkOnIssue(issue_id, {
      projectPath: project_path,
      timeout,
    });

    // Get updated issue
    const updatedIssue = await bd.showIssue(issue_id, project_path);

    return c.json({
      success: true,
      subtasksGenerated: true,
      subtasks: createdSubtasks,
      plan: parsed,
      issue: updatedIssue,
      ...workResult,
    });
  } catch (error: any) {
    console.error("Failed to generate and start:", error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /api/bd/generate-task
 * Generate title, description, and labels from a prompt using the pi-agent
 */
const generateTaskSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
  type: z.enum(["bug", "feature", "task", "epic", "chore"]).optional(),
});

bdRoutes.post("/generate-task", zValidator("json", generateTaskSchema), async (c) => {
  const { prompt, type = "task" } = c.req.valid("json");

  try {
    // Import pi-agent
    const { getPiAgentSession } = await import("../lib/pi-agent.js");
    const session = getPiAgentSession();

    if (!session) {
      return c.json({ error: "Pi-agent session not initialized" }, 500);
    }

    // Create a prompt to generate title, description, and labels
    const agentPrompt = `You are a task management assistant. Based on the following prompt, generate a complete task with title, description, and relevant labels.

User Prompt: "${prompt}"
Type: ${type}

Your job is to expand this brief prompt into a complete, well-structured task. The description should be detailed enough for a developer to understand what needs to be done.

Respond with a JSON object in the following format (no markdown, no explanation):
{
  "title": "concise title (max 80 chars)",
  "description": "detailed description explaining what to implement, includes context, requirements, and expected outcome",
  "labels": ["label1", "label2", "label3"]
}

Guidelines for title:
- Be concise and action-oriented
- Start with a verb if it's a task or feature
- Max 80 characters
- Should clearly communicate what the issue is about

Guidelines for description:
- Expand the prompt into a full description
- Include context about what needs to be done
- Mention specific files, components, or systems affected (if applicable)
- Describe expected outcomes or acceptance criteria
- Keep it clear and actionable (2-4 paragraphs typically)
- Write in present tense, as if instructing a developer

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
    await session.prompt(agentPrompt);

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
      // Handle various formats: ```json ... ```, ``` ... ```, or plain JSON
      let cleaned = fullResponse.trim();

      // Remove opening markdown code block (```json or ```)
      // Match: ``` followed by optional "json" or other language, then optional whitespace, then newline
      const openingMatch = cleaned.match(/```\w*\s*\r?\n/);
      if (openingMatch) {
        cleaned = cleaned.slice(openingMatch[0].length);
      }

      // Remove closing markdown code block
      const closingMatch = cleaned.match(/```\s*$/);
      if (closingMatch) {
        cleaned = cleaned.slice(0, closingMatch.index);
      }

      cleaned = cleaned.trim();

      // Apply JSON cleaning BEFORE extraction to remove server log markers
      cleaned = cleanJsonString(cleaned);

      // Extract JSON object using the helper function
      const extracted = extractJsonObject(cleaned);
      if (extracted) {
        cleaned = extracted;
      }

      cleaned = cleaned.trim();

      // Apply JSON cleaning again AFTER extraction for any remaining syntax fixes
      cleaned = cleanJsonString(cleaned);

      // Try strict JSON parsing first
      try {
        parsed = JSON.parse(cleaned);
      } catch (strictError) {
        // If strict parsing fails, try JSON5 which is more lenient
        try {
          parsed = JSON5.parse(cleaned);
        } catch (json5Error) {
          // Both failed, use fallback
          throw strictError;
        }
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      console.error("Response content:", fullResponse);
      // Fallback: use the prompt as the description
      parsed = {
        title: prompt.split("\n")[0].substring(0, 80),
        description: prompt,
        labels: ["ai-generated"]
      };
    }

    return c.json({
      title: parsed.title || prompt.split("\n")[0].substring(0, 80),
      description: parsed.description || prompt,
      labels: parsed.labels || []
    });
  } catch (error: any) {
    console.error("Failed to generate task:", error);
    return c.json({ error: error.message }, 500);
  }
});

export { bdRoutes };
