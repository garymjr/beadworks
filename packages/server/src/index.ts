import { serve } from "bun";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { bdRoutes } from "./routes/bd.js";
import { cwdRoutes } from "./routes/cwd.js";
import { workRoutes } from "./routes/work.js";
import { projectsRoutes } from "./routes/projects.js";
import { initializePiAgent } from "./lib/pi-agent.js";
import { initializeAgentPool } from "./lib/agent-pool.js";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
    credentials: true,
  })
);

// Health check
app.get("/", (c) => {
  return c.json({
    status: "ok",
    message: "Beadworks API is running",
    version: "0.0.1",
  });
});

app.get("/api/health", (c) => {
  return c.json({ status: "healthy" });
});

// Mount bd routes
app.route("/api/bd", bdRoutes);

// Mount work routes
app.route("/api/work", workRoutes);

// Mount projects routes
app.route("/api/projects", projectsRoutes);

// Mount cwd routes
app.route("/", cwdRoutes);

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal Server Error", message: err.message }, 500);
});

// Initialize pi-mono agent
await initializePiAgent();

// Initialize agent pool
await initializeAgentPool();
console.log('✅ Agent pool initialized');

// Start server
const port = process.env.PORT || 3001;

serve({
  fetch: app.fetch,
  port,
});

console.log(`🚀 Server running at http://localhost:${port}`);
