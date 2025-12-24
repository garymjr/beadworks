/**
 * Wrapper functions for executing bd CLI commands
 */

import { existsSync } from "fs";
import { join } from "path";

/**
 * Check if a .beads directory exists AND is properly initialized
 * (i.e., has the issues.jsonl database file)
 */
export function isBeadsInitialized(projectPath: string): boolean {
  const beadsDir = join(projectPath, ".beads");
  const issuesFile = join(beadsDir, "issues.jsonl");
  return existsSync(beadsDir) && existsSync(issuesFile);
}

/**
 * Initialize a new beads database in the project directory
 */
export async function initBeads(projectPath: string): Promise<any> {
  const { existsSync } = await import("fs");

  // Check if project directory exists
  if (!existsSync(projectPath)) {
    throw new Error(`Project directory does not exist: ${projectPath}`);
  }

  // For init, we need to run in the target directory, not set BEADS_DIR
  const cmd = ["bd", "init", "--json"];

  console.error(`[bd init] Running in directory: ${projectPath}`);

  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
    cwd: projectPath, // Set working directory to project path
    env: process.env,
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  console.error(`[bd init] Exit code: ${exitCode}`);
  console.error(`[bd init] stdout: ${stdout.substring(0, 200)}`);
  console.error(`[bd init] stderr: ${stderr.substring(0, 200)}`);

  if (exitCode !== 0) {
    throw new Error(`bd init failed (exit ${exitCode}): ${stderr || stdout}`);
  }

  // Check if .beads was actually created
  const { join } = await import("path");
  const beadsDir = join(projectPath, ".beads");
  const issuesFile = join(beadsDir, "issues.jsonl");

  if (!existsSync(beadsDir)) {
    throw new Error(`bd init completed but .beads directory was not created`);
  }

  if (!existsSync(issuesFile)) {
    throw new Error(`bd init completed but issues.jsonl was not created. Looking for: ${issuesFile}`);
  }

  // Parse JSON output or return success
  try {
    return JSON.parse(stdout);
  } catch (e) {
    // init might not return JSON - check if it succeeded anyway
    return { success: true, output: stdout };
  }
}

/**
 * Execute a bd command and return the parsed JSON output
 */
async function execBdCommand(args: string[], dbPath?: string): Promise<any> {
  const cmd = ["bd", ...args, "--json"];
  
  const env: Record<string, string> = {};
  
  // Copy process.env, filtering out undefined values
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  
  // Set custom database path if provided
  if (dbPath) {
    env.BEADS_DIR = dbPath;
  }
  
  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
    env,
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`bd command failed: ${stderr || stdout}`);
  }

  // Parse JSON output
  try {
    return JSON.parse(stdout);
  } catch (e) {
    // Some commands might not return JSON
    return { output: stdout };
  }
}

/**
 * List issues with optional filters
 */
export async function listIssues(filters?: {
  status?: string;
  type?: string;
  assignee?: string;
  priority?: string;
  labels?: string[];
  limit?: number;
  sort?: string;
  reverse?: boolean;
}, dbPath?: string) {
  const args = ["list"];

  if (filters?.status) args.push("--status", filters.status);
  if (filters?.type) args.push("--type", filters.type);
  if (filters?.assignee) args.push("--assignee", filters.assignee);
  if (filters?.priority) args.push("--priority", filters.priority);
  if (filters?.labels) {
    filters.labels.forEach((label) => args.push("--label", label));
  }
  if (filters?.limit) args.push("--limit", filters.limit.toString());
  if (filters?.sort) args.push("--sort", filters.sort);
  if (filters?.reverse) args.push("--reverse");

  return execBdCommand(args, dbPath);
}

/**
 * Show issue details
 */
export async function showIssue(id: string, dbPath?: string) {
  return execBdCommand(["show", id], dbPath);
}

/**
 * Create a new issue
 */
export async function createIssue(data: {
  title: string;
  description?: string;
  type?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  labels?: string[];
  estimate?: number;
  acceptance?: string;
  design?: string;
  externalRef?: string;
  parent?: string;
  deps?: string[];
}, dbPath?: string) {
  const args = ["create", data.title];

  if (data.description) args.push("--description", data.description);
  if (data.type) args.push("--type", data.type);
  if (data.status) args.push("--status", data.status);
  if (data.priority) args.push("--priority", data.priority);
  if (data.assignee) args.push("--assignee", data.assignee);
  if (data.labels) args.push("--labels", data.labels.join(","));
  if (data.estimate) args.push("--estimate", data.estimate.toString());
  if (data.acceptance) args.push("--acceptance", data.acceptance);
  if (data.design) args.push("--design", data.design);
  if (data.externalRef) args.push("--external-ref", data.externalRef);
  if (data.parent) args.push("--parent", data.parent);
  if (data.deps) args.push("--deps", data.deps.join(","));

  return execBdCommand(args, dbPath);
}

/**
 * Update an issue
 */
export async function updateIssue(
  id: string,
  data: {
    title?: string;
    description?: string;
    type?: string;
    status?: string;
    priority?: string;
    assignee?: string;
    addLabels?: string[];
    removeLabels?: string[];
    setLabels?: string[];
    estimate?: number;
    acceptance?: string;
    design?: string;
    externalRef?: string;
    notes?: string;
  },
  dbPath?: string
) {
  const args = ["update", id];

  if (data.title) args.push("--title", data.title);
  if (data.description) args.push("--description", data.description);
  if (data.type) args.push("--type", data.type);
  if (data.status) args.push("--status", data.status);
  if (data.priority) args.push("--priority", data.priority);
  if (data.assignee) args.push("--assignee", data.assignee);
  if (data.addLabels) {
    data.addLabels.forEach((label) => args.push("--add-label", label));
  }
  if (data.removeLabels) {
    data.removeLabels.forEach((label) => args.push("--remove-label", label));
  }
  if (data.setLabels) {
    data.setLabels.forEach((label) => args.push("--set-labels", label));
  }
  if (data.estimate) args.push("--estimate", data.estimate.toString());
  if (data.acceptance) args.push("--acceptance", data.acceptance);
  if (data.design) args.push("--design", data.design);
  if (data.externalRef) args.push("--external-ref", data.externalRef);
  if (data.notes) args.push("--notes", data.notes);

  return execBdCommand(args, dbPath);
}

/**
 * Close an issue
 */
export async function closeIssue(id: string, dbPath?: string) {
  return execBdCommand(["close", id], dbPath);
}

/**
 * Reopen an issue
 */
export async function reopenIssue(id: string, dbPath?: string) {
  return execBdCommand(["reopen", id], dbPath);
}

/**
 * Delete an issue
 */
export async function deleteIssue(id: string, dbPath?: string) {
  return execBdCommand(["delete", id], dbPath);
}

/**
 * Get issue statistics
 */
export async function getStats(dbPath?: string) {
  return execBdCommand(["stats"], dbPath);
}

/**
 * Get status overview
 */
export async function getStatus(dbPath?: string) {
  return execBdCommand(["status"], dbPath);
}

/**
 * Search issues
 */
export async function searchIssues(query: string, dbPath?: string) {
  return execBdCommand(["search", query], dbPath);
}

/**
 * Show blocked issues
 */
export async function getBlockedIssues(dbPath?: string) {
  return execBdCommand(["blocked"], dbPath);
}

/**
 * Show ready issues (no blockers)
 */
export async function getReadyIssues(dbPath?: string) {
  return execBdCommand(["ready"], dbPath);
}

/**
 * Show stale issues
 */
export async function getStaleIssues(dbPath?: string) {
  return execBdCommand(["stale"], dbPath);
}

/**
 * Get database info
 */
export async function getInfo(dbPath?: string) {
  return execBdCommand(["info"], dbPath);
}

/**
 * List available projects/repositories
 */
export async function listRepos(dbPath?: string) {
  return execBdCommand(["repo", "list"], dbPath);
}

/**
 * Get labels
 */
export async function getLabels(dbPath?: string) {
  return execBdCommand(["label", "list"], dbPath);
}

/**
 * Add comment to issue
 */
export async function addComment(id: string, comment: string, dbPath?: string) {
  return execBdCommand(["comment", id, comment], dbPath);
}

/**
 * Get comments for issue
 */
export async function getComments(id: string, dbPath?: string) {
  return execBdCommand(["comments", "list", id], dbPath);
}

/**
 * Manage dependencies
 */
export async function addDep(issue: string, dep: string, dbPath?: string) {
  return execBdCommand(["dep", "add", issue, dep], dbPath);
}

export async function removeDep(issue: string, dep: string, dbPath?: string) {
  return execBdCommand(["dep", "remove", issue, dep], dbPath);
}

/**
 * Cleanup closed issues
 */
export async function cleanupClosedIssues(dbPath?: string, olderThanDays?: number) {
  const args = ["cleanup", "--force", "--json"];
  
  if (olderThanDays !== undefined) {
    args.push("--older-than", olderThanDays.toString());
  }
  
  return execBdCommand(args, dbPath);
}
