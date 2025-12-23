# @beadworks/server

Beadworks backend API server built with Hono and Bun.

## Features

- ⚡️ Built with [Hono](https://hono.dev/) - Fast, lightweight web framework
- 🔥 Powered by [Bun](https://bun.sh/) - Fast JavaScript runtime
- 🛣️ RESTful API structure
- 📝 Built-in logging
- 🌐 CORS configured for local development
- 💪 Full TypeScript support

## Development

```bash
# Run in development mode (with hot reload)
bun run dev

# Start server
bun run start

# Type checking
bun run typecheck
```

The server runs on `http://localhost:3001` by default.

## API Endpoints

- `GET /` - Health check and server info
- `GET /api/health` - Health status
- `GET /api/hello` - Example endpoint

## Environment Variables

- `PORT` - Server port (default: 3001)
