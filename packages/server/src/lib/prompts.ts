/**
 * Work prompt builder for agent tasks
 * Builds prompts for the agent based on issue details and context
 */

import { showIssue } from './bd-cli.js'

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

  // Get subtasks if this is a parent issue
  let subtasks: Array<{ id: string; title: string; description: string; status: string }> = []
  
  // Note: We could fetch subtasks here, but for now we'll work with what we have
  // The subtasks can be fetched separately if needed

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
    prompt += `\n═══════════════════════════════════════════════════════════════
SUBTASKS TO COMPLETE
═══════════════════════════════════════════════════════════════

${subtasks.map((st, i) => `${i + 1}. [${st.status}] ${st.title}
   ${st.description || ''}`).join('\n\n')}
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
1. Start by reading relevant files to understand the codebase
2. Plan your approach before making changes
3. Implement the changes incrementally
4. Test your changes
5. Provide a summary of what was done

═══════════════════════════════════════════════════════════════
EXPECTED OUTPUT
═══════════════════════════════════════════════════════════════

When you complete the work, provide a summary that includes:
- What was implemented
- Files that were modified or created
- Any tests that were added or updated
- Any important notes or considerations for the reviewer

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
