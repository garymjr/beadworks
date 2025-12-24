/**
 * Work prompt builder for agent tasks
 * Builds prompts for the agent based on issue details and context
 */

import { showIssue, getSubtasks } from './bd-cli.js'

export interface IssueContext {
  id: string
  title: string
  description: string
  type: string
  labels?: string[]
  acceptanceCriteria?: string
  designNotes?: string
  parent?: string
  subtasks?: Array<{
    id: string
    title: string
    description: string
    status: string
  }>
}

/**
 * Build a work prompt for the agent based on issue details
 * NOTE: This is kept for backward compatibility but subtasks are now processed individually
 */
export async function buildWorkPrompt(
  issueId: string,
  projectPath?: string
): Promise<{ prompt: string; context: IssueContext }> {
  // Get issue details
  const issueResult = await showIssue(issueId, projectPath)
  const issue = Array.isArray(issueResult) ? issueResult[0] : issueResult

  if (!issue) {
    throw new Error(`Issue ${issueId} not found`)
  }

  // Get subtasks for context
  let subtasks: Array<{ id: string; title: string; description: string; status: string }> = []

  try {
    const subtaskResult = await getSubtasks(issueId, projectPath)
    subtasks = subtaskResult.subtasks.map((st: any) => ({
      id: st.id,
      title: st.title || st.Title || '',
      description: st.description || st.Description || st.body || st.content || '',
      status: st.status,
    }))
    console.log(`[Prompts] Found ${subtasks.length} subtasks for issue ${issueId}`)
  } catch (error) {
    console.warn(`[Prompts] Could not fetch subtasks for ${issueId}:`, error)
  }

  const context: IssueContext = {
    id: issue.id,
    title: issue.title || issue.Title || '',
    description: issue.description || issue.Description || issue.body || issue.content || '',
    type: issue.type || issue.issue_type || issue.Type || 'task',
    labels: issue.labels || issue.Labels || [],
    acceptanceCriteria: issue.acceptance || issue.acceptanceCriteria,
    designNotes: issue.design || issue.designNotes,
    parent: issue.parent,
    subtasks,
  }

  const prompt = formatWorkPrompt(context)
  return { prompt, context }
}

/**
 * Build a prompt for a single subtask
 */
export async function buildPromptForSubtask(
  subtask: any,
  parentIssueId: string,
  projectPath?: string
): Promise<{ prompt: string }> {
  // Get parent issue context
  const parentResult = await showIssue(parentIssueId, projectPath)
  const parentIssue = Array.isArray(parentResult) ? parentResult[0] : parentResult

  const parentTitle = parentIssue?.title || parentIssue?.Title || 'Unknown Issue'
  const parentDesc = parentIssue?.description || parentIssue?.Description || ''

  const prompt = `You are a senior software engineer working on a subtask of a larger issue.

PARENT ISSUE:
Title: ${parentTitle}
Description: ${parentDesc || 'No description'}

═══════════════════════════════════════════════════════════════
YOUR SUBTASK TO IMPLEMENT
═══════════════════════════════════════════════════════════════

Subtask ID: ${subtask.id}
Title: ${subtask.title}
Description: ${subtask.description || 'No description provided'}

═══════════════════════════════════════════════════════════════
CRITICAL REQUIREMENTS
═══════════════════════════════════════════════════════════════

YOU MUST ACTUALLY IMPLEMENT THIS SUBTASK.
- This is NOT a planning or analysis task
- You MUST make actual code changes (write, edit files, run commands)
- Merely explaining what you would do is NOT sufficient
- The system validates that files are modified before marking complete

═══════════════════════════════════════════════════════════════
IMPLEMENTATION GUIDELINES
═══════════════════════════════════════════════════════════════

1. Read and understand the existing codebase FIRST
2. Focus ONLY on this specific subtask - do not try to do other subtasks
3. Make ACTUAL changes to code files (use write/edit tools)
4. Add or update tests as needed
5. Run tests to verify your changes work
6. Only consider it done when the code is written and tested

═══════════════════════════════════════════════════════════════
EXPECTED OUTPUT
═══════════════════════════════════════════════════════════════

When complete, provide a summary that MUST include:
- What you implemented (specific changes made)
- Files you modified or created (list file paths)
- Any tests you added or updated
- Any important notes

IMPORTANT: Your work will be validated. If no files were modified, the subtask will NOT be marked complete.

Please implement this subtask now. Show your work as you progress.
`

  return { prompt }
}

/**
 * Format the work prompt for the agent
 */
function formatWorkPrompt(context: IssueContext): string {
  const { title, description, type, labels, acceptanceCriteria, designNotes, subtasks } = context

  let prompt = `You are a senior software engineer working on the following issue. Please implement it completely.

═══════════════════════════════════════════════════════════════
ISSUE TO IMPLEMENT
═══════════════════════════════════════════════════════════════

ID: ${context.id}
Title: ${title}
Type: ${type}

DESCRIPTION:
${description || 'No description provided'}
`

  if (labels && labels.length > 0) {
    prompt += `\nLABELS:\n${labels.map(l => `  - ${l}`).join('\n')}\n`
  }

  if (acceptanceCriteria) {
    prompt += `\nACCEPTANCE CRITERIA:\n${acceptanceCriteria}\n`
  }

  if (designNotes) {
    prompt += `\nDESIGN NOTES:\n${designNotes}\n`
  }

  if (subtasks && subtasks.length > 0) {
    prompt += `
═══════════════════════════════════════════════════════════════
SUBTASKS TO COMPLETE
═══════════════════════════════════════════════════════════════

This issue has ${subtasks.length} subtasks. YOU MUST COMPLETE ALL SUBTASKS before considering this issue complete.

${subtasks.map((st, i) => `${i + 1}. [${st.status === 'closed' ? '✓' : ' '}] ${st.title}
   ${st.description || ''}`).join('\n\n')}

IMPORTANT: Work through each subtask systematically. Mark each as complete (by closing it) as you finish it.
`
  }

  prompt += `
═══════════════════════════════════════════════════════════════
IMPLEMENTATION GUIDELINES
═══════════════════════════════════════════════════════════════

1. Read and understand existing code before making changes
2. Write clean, well-documented code
3. Add or update tests as needed
4. Follow the project's existing patterns and conventions
5. Consider edge cases and error handling
6. Use appropriate tools (file_read, file_write, bash, etc.)

WORKFLOW:
${subtasks && subtasks.length > 0 ? `
1. Review all subtasks above
2. Work through each subtask one at a time
3. For each subtask:
   a. Read relevant files
   b. Plan your approach
   c. Implement the changes
   d. Test your changes
   e. Mark the subtask as complete (using bd close)
4. After ALL subtasks are complete, summarize your work
` : `
1. Start by reading relevant files to understand the codebase
2. Plan your approach before making changes
3. Implement the changes incrementally
4. Test your changes
5. Provide a summary of what was done
`}

═══════════════════════════════════════════════════════════════
EXPECTED OUTPUT
═══════════════════════════════════════════════════════════════

When you complete the work, provide a summary that includes:
- What was implemented
- Files that were modified or created
- Any tests that were added or updated
- Any important notes or considerations for the reviewer

${subtasks && subtasks.length > 0 ? `
CRITICAL: You MUST complete ALL subtasks before finishing.
The system will verify that all subtasks are closed before marking this issue complete.
` : ''}

Please begin working on this issue now. Show your work as you progress.
`

  return prompt
}

/**
 * Build a prompt for generating a plan with subtasks
 */
export function buildPlanPrompt(title: string, description: string, type: string): string {
  return `You are a senior software engineer and technical lead. Your job is to break down the following issue into concrete implementation steps.

THE ISSUE TO PLAN:
Title: ${title}
Description: ${description || "No description"}
Type: ${type}

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

CRITICAL: Respond with VALID JSON ONLY. No markdown, no explanation, no text before or after the JSON.
Your JSON must have proper syntax:
- All property names in double quotes: "title": not title:
- All string values in double quotes
- Proper commas between properties
- No trailing commas

IMPORTANT - AVOID COLONS IN STRING VALUES:
When writing descriptions, AVOID patterns like "step 1):", "that":", etc. inside quoted strings.
These break JSON parsers. Instead use:
- "step 1)" without colon after the parenthesis
- "that does" instead of "that":"
- Semicolons or dashes instead of colons for lists
- Bullet points with • or -

{
  "plan": "Brief technical approach (2-3 sentences explaining the overall strategy)",
  "subtasks": [
    {
      "title": "Implementation step title",
      "description": "Specific technical details - what files to modify, what functions to create, etc. Use semicolons for lists; avoid colons after quotes.",
      "type": "task"
    }
  ],
  "risks": ["Potential technical risks, edge cases to consider, or things that might go wrong"]
}

EXAMPLE OF GOOD SUBTASKS:
- "Create REST API endpoint for user registration" → "Add POST /api/users/register route in src/routes/users.ts. Implement input validation; password hashing with bcrypt; user creation. Return 201 with user object or 400 for validation errors."
- "Add unit tests for payment processing" → "Create test file src/services/payment.test.ts. Add tests for successful payment, failed payment, and edge cases like insufficient funds. Use jest mock for Stripe API."

EXAMPLE OF BAD SUBTASKS (avoid these):
- "Create subtasks for this issue"
- "Plan the implementation approach"
- "Research the best way to implement"

Remember: These are REAL implementation steps. Each subtask should be something a developer sits down and codes.

IMPORTANT: Double-check your JSON syntax before responding. Ensure:
1. Every property name has both opening and closing quotes
2. Every comma is in the right place
3. No trailing commas before closing braces/brackets
4. NO patterns like "word": inside string values (breaks JSON!)

Respond ONLY with the JSON object, nothing else.`
}

/**
 * Build a prompt for generating task metadata (title, labels) from a description
 */
export function buildTaskPrompt(description: string, type: string): string {
  return `You are a task management assistant. Based on the following description, generate a concise title and relevant labels.

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

Respond ONLY with the JSON object, nothing else.`
}
