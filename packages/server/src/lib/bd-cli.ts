/**
 * Wrapper functions for executing bd CLI commands
 */

/**
 * Execute a bd command and return the parsed JSON output
 */
async function execBdCommand(args: string[]): Promise<any> {
  const cmd = ["bd", ...args, "--json"];
  
  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
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
}) {
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

  return execBdCommand(args);
}

/**
 * Show issue details
 */
export async function showIssue(id: string) {
  return execBdCommand(["show", id]);
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
}) {
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

  return execBdCommand(args);
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
  }
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

  return execBdCommand(args);
}

/**
 * Close an issue
 */
export async function closeIssue(id: string) {
  return execBdCommand(["close", id]);
}

/**
 * Reopen an issue
 */
export async function reopenIssue(id: string) {
  return execBdCommand(["reopen", id]);
}

/**
 * Delete an issue
 */
export async function deleteIssue(id: string) {
  return execBdCommand(["delete", id]);
}

/**
 * Get issue statistics
 */
export async function getStats() {
  return execBdCommand(["stats"]);
}

/**
 * Get status overview
 */
export async function getStatus() {
  return execBdCommand(["status"]);
}

/**
 * Search issues
 */
export async function searchIssues(query: string) {
  return execBdCommand(["search", query]);
}

/**
 * Show blocked issues
 */
export async function getBlockedIssues() {
  return execBdCommand(["blocked"]);
}

/**
 * Show ready issues (no blockers)
 */
export async function getReadyIssues() {
  return execBdCommand(["ready"]);
}

/**
 * Show stale issues
 */
export async function getStaleIssues() {
  return execBdCommand(["stale"]);
}

/**
 * Get database info
 */
export async function getInfo() {
  return execBdCommand(["info"]);
}

/**
 * List available projects/repositories
 */
export async function listRepos() {
  return execBdCommand(["repo", "list"]);
}

/**
 * Get labels
 */
export async function getLabels() {
  return execBdCommand(["label", "list"]);
}

/**
 * Add comment to issue
 */
export async function addComment(id: string, comment: string) {
  return execBdCommand(["comment", id, "--message", comment]);
}

/**
 * Get comments for issue
 */
export async function getComments(id: string) {
  return execBdCommand(["comments", "list", id]);
}

/**
 * Manage dependencies
 */
export async function addDep(issue: string, dep: string) {
  return execBdCommand(["dep", "add", issue, dep]);
}

export async function removeDep(issue: string, dep: string) {
  return execBdCommand(["dep", "remove", issue, dep]);
}
