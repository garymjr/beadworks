# Beadworks Monorepo

A monorepo containing the Beadworks UI application.

## Structure

```
beadworks/
└── packages/
    └── ui/          # Main UI application
```

## Getting Started

To install dependencies and run the application:

```bash
bun install
bun dev
```

## Available Scripts

- `bun dev` - Start development server
- `bun build` - Build for production
- `bun preview` - Preview production build
- `bun test` - Run tests
- `bun lint` - Run linter
- `bun format` - Format code
- `bun check` - Run linting and formatting

## Packages

### @beadworks/ui

The main UI application built with TanStack Start, React, and Tailwind CSS.

See [`packages/ui/README.md`](./packages/ui/README.md) for detailed documentation.
