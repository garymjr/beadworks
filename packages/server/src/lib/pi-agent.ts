import { createAgentSession, SessionManager } from "@mariozechner/pi-coding-agent";
import { agentEvents } from "./events.js";

let agentSession: Awaited<ReturnType<typeof createAgentSession>>["session"] | null = null;

/**
 * Initialize the pi-mono agent session.
 * Should be called once when the server starts.
 */
export async function initializePiAgent() {
  if (agentSession) {
    console.log("[Pi-Agent] Session already initialized");
    return agentSession;
  }

  console.log("[Pi-Agent] Initializing session...");

  try {
    const { session } = await createAgentSession({
      // Use in-memory session manager for now
      // TODO: Consider persistent sessions for production
      sessionManager: SessionManager.inMemory(),
    });

    agentSession = session;

    // Subscribe to agent events for logging and broadcasting
    // Note: This will capture events for ALL agent work, not just work-triggered issues
    // The work-manager will filter and route events appropriately
    session.subscribe((event: any) => {
      // Log events for debugging (skip message_update to avoid token spam)
      if (event.type !== "message_update") {
        console.log(`[Pi-Agent] Event: ${event.type}`);
      }

      // Forward relevant events to the event system
      // The work store will filter by issueId/workId as needed
      // Skip message_update events to reduce log noise
      if (event.type === "tool_execution_start") {
        console.log(`[Pi-Agent] Tool call: ${event.toolName || "unknown"}`);
      } else if (event.type === "tool_execution_end") {
        if (event.error) {
          console.error(`[Pi-Agent] Tool error: ${event.error}`);
        }
      } else if (event.type === "agent_end") {
        console.log("[Pi-Agent] Agent finished work");
      }
    });

    console.log(`[Pi-Agent] Session initialized with ID: ${session.sessionId}`);

    return agentSession;
  } catch (error) {
    console.error("[Pi-Agent] Failed to initialize session:", error);
    throw error;
  }
}

/**
 * Get the current agent session instance.
 * Returns null if not yet initialized.
 */
export function getPiAgentSession() {
  return agentSession;
}

/**
 * Check if the pi agent is ready.
 */
export function isPiAgentReady() {
  return agentSession !== null;
}
