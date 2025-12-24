import { createAgentSession, SessionManager } from "@mariozechner/pi-coding-agent";

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

      // Subscribe to events for logging
      // session.subscribe((event) => {
      //   if (event.type === "message_update") {
      //     const msgEvent = event.assistantMessageEvent;
      //     if (msgEvent.type === "text_delta") {
      //       process.stdout.write(msgEvent.delta);
      //     }
      //   }
      // }),
    });

    agentSession = session;
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
