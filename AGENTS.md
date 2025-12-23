## Beadworks Project

This is a monorepo containing the Beadworks UI application.

### Quick Start

```bash
# Install dependencies
bun install

# Start development server
bun dev              # Start the backend server
bun dev:ui           # Start the UI dev server (http://localhost:3000)
bun dev:all          # Start both server and UI concurrently

# Build and preview
bun build            # Build UI for production
bun preview          # Preview production build

# Code quality
bun test             # Run tests
bun lint             # Run linter
bun format           # Format code
bun check            # Run linting and formatting
```

### Development Server Policy

**IMPORTANT**: AI agents should **NEVER** attempt to start any servers. Always assume servers are already running.

- ❌ Do NOT run `bun dev`
- ❌ Do NOT run `bun dev:ui`
- ❌ Do NOT run `bun dev:all`
- ✅ Assume the backend server is available
- ✅ Assume the UI dev server is available at `http://localhost:3000`
- ✅ Use `bun build` to build the UI if needed

If a server is not running, ask the user to start it. Do not attempt to start servers yourself.

### Design Guidelines

When working on the UI, follow the established **"Digital Abacus"** design system:

- **Core Metaphor**: Tasks are glass beads sliding on wire tracks
- **Design System**: See [`packages/ui/docs/DESIGN_PATTERNS.md`](./packages/ui/docs/DESIGN_PATTERNS.md)
  - Color palette (deep slate gradients, glowing bead colors)
  - Typography (Outfit for display, JetBrains Mono for code)
  - Component patterns (Bead, Wire Track, Connectors)
  - Interaction patterns (drag & drop, hover effects)
  - Animation patterns (page load, ambient, micro-interactions)
- **Design Philosophy**: Fluid, tactile, delightful interactions
- **Key Files**:
  - `packages/ui/src/routes/index.tsx` - Main kanban board
  - `packages/ui/src/styles.css` - Global styles and animations
  - `packages/ui/src/routes/__root.tsx` - Root layout

**Before modifying the UI:** Read the design patterns document to maintain visual consistency.

### Project Structure

```
beadworks/
├── packages/
│   ├── server/      # Backend server
│   └── ui/          # Main UI application (TanStack Start + React + Tailwind)
│       └── docs/
│           └── DESIGN_PATTERNS.md    # UI design system and component patterns
├── AGENTS.md        # This file - AI agent instructions
└── README.md        # Project overview
```

For more details, see [`README.md`](./README.md) and [`packages/ui/README.md`](./packages/ui/README.md).

---

## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Auto-syncs to JSONL for version control
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**

```bash
bd ready --json
```

**Create new issues:**

```bash
bd create "Issue title" -t bug|feature|task -p 0-4 --json
bd create "Issue title" -p 1 --deps discovered-from:bd-123 --json
bd create "Subtask" --parent <epic-id> --json  # Hierarchical subtask (gets ID like epic-id.1)
```

**Claim and update:**

```bash
bd update bd-42 --status in_progress --json
bd update bd-42 --priority 1 --json
```

**Complete work:**

```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task**: `bd update <id> --status in_progress`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`
6. **Commit together**: Always commit the `.beads/issues.jsonl` file together with the code changes so issue state stays in sync with code state

### Writing Self-Contained Issues

Issues must be fully self-contained - readable without any external context (plans, chat history, etc.). A future session should understand the issue completely from its description alone.

**Required elements:**

- **Summary**: What and why in 1-2 sentences
- **Files to modify**: Exact paths (with line numbers if relevant)
- **Implementation steps**: Numbered, specific actions
- **Example**: Show before → after transformation when applicable

**Optional but helpful:**

- Edge cases or gotchas to watch for
- Test references (point to test files or test_data examples)
- Dependencies on other issues

**Bad example:**

```
Implement the refactoring from the plan
```

**Good example:**

```
Add timeout parameter to fetchUser() in src/api/users.ts

1. Add optional timeout param (default 5000ms)
2. Pass to underlying fetch() call
3. Update tests in src/api/users.test.ts

Example: fetchUser(id) → fetchUser(id, { timeout: 3000 })
Depends on: bd-abc123 (fetch wrapper refactor)
```

### Dependencies: Think "Needs", Not "Before"

`bd dep add X Y` = "X needs Y" = Y blocks X

**TRAP**: Temporal words ("Phase 1", "before", "first") invert your thinking!

```
WRONG: "Phase 1 before Phase 2" → bd dep add phase1 phase2
RIGHT: "Phase 2 needs Phase 1" → bd dep add phase2 phase1
```

**Verify**: `bd blocked` - tasks blocked by prerequisites, not dependents.

### Auto-Sync

bd automatically syncs with git:

- Exports to `.beads/issues.jsonl` after changes (5s debounce)
- Imports from JSONL when newer (e.g., after `git pull`)
- No manual export/import needed!

### GitHub Copilot Integration

If using GitHub Copilot, also create `.github/copilot-instructions.md` for automatic instruction loading.
Run `bd onboard` to get the content, or see step 2 of the onboard instructions.

### Managing AI-Generated Planning Documents

AI assistants often create planning and design documents during development:

- PLAN.md, IMPLEMENTATION.md, ARCHITECTURE.md
- DESIGN.md, CODEBASE_SUMMARY.md, INTEGRATION_PLAN.md
- TESTING_GUIDE.md, TECHNICAL_DESIGN.md, and similar files

**Best Practice: Use a dedicated directory for these ephemeral files**

**Recommended approach:**

- Create a `history/` directory in the project root
- Store ALL AI-generated planning/design docs in `history/`
- Keep the repository root clean and focused on permanent project files
- Only access `history/` when explicitly asked to review past planning

**Example .gitignore entry (optional):**

```
# AI planning documents (ephemeral)
history/
```

**Benefits:**

- ✅ Clean repository root
- ✅ Clear separation between ephemeral and permanent documentation
- ✅ Easy to exclude from version control if desired
- ✅ Preserves planning history for archeological research
- ✅ Reduces noise when browsing the project

### CLI Help

Run `bd <command> --help` to see all available flags for any command.
For example: `bd create --help` shows `--parent`, `--deps`, `--assignee`, etc.

### Important Rules

- ✅ Use bd for ALL task tracking
- ✅ Always use `--json` flag for programmatic use
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ✅ Store AI planning docs in `history/` directory
- ✅ Run `bd <cmd> --help` to discover available flags
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems
- ❌ Do NOT clutter repo root with planning documents

For more details, see README.md and QUICKSTART.md.
