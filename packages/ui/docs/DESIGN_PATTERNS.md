# Beadworks UI Design Patterns

## Design Philosophy: "Digital Abacus"

Beadworks uses a **bead-as-task metaphor** where work items are represented as glowing glass beads that slide along wire tracks. This concept provides:

- **Tactile feel**: Tasks feel like physical objects you manipulate
- **Visual hierarchy**: Bead colors, sizes, and glow states convey priority and status
- **Flow perception**: Movement through the pipeline feels like beads sliding on wires
- **Delightful interactions**: Micro-animations make task management feel playful

---

## Core Visual Language

### Color Palette

```css
/* Backgrounds - Deep, atmospheric slate gradients */
--bg-primary: #020617; /* slate-950 */
--bg-secondary: #0f172a; /* slate-900 */
--bg-accent: #1e1b4b; /* indigo-950 */

/* Bead Colors - Task-specific with priority meanings */
--bead-critical: #ff6b6b; /* Coral red */
--bead-high: #ffd93d; /* Warm yellow */
--bead-medium: #6bcb77; /* Soft green */
--bead-low: #4d96ff; /* Sky blue */
--bead-feature: #9b59b6; /* Purple */

/* UI Accents */
--accent-primary: #8b5cf6; /* Violet */
--accent-glow: rgba(139, 92, 246, 0.3);
--border-subtle: rgba(255, 255, 255, 0.05);
--border-hover: rgba(255, 255, 255, 0.1);
```

### Typography Hierarchy

```css
/* Display Font: Outfit (Geometric, modern, friendly) */
font-family: 'Outfit', sans-serif;

/* Headers & Titles */
--text-display: 700 24px/1 'Outfit'; /* Main heading */
--text-h1: 600 18px/1.2 'Outfit'; /* Column titles */
--text-card-title: 500 16px/1.3 'Outfit'; /* Task titles */

/* Monospace Font: JetBrains Mono (Technical, precise) */
font-family: 'JetBrains Mono', monospace;

/* Code & Metadata */
--text-code: 400 12px/1.5 'JetBrains Mono'; /* Tags, IDs */
--text-meta: 400 11px/1.4 'JetBrains Mono'; /* Timestamps, stats */
```

### Glass Morphism

All cards use layered transparency for depth:

```css
.glass-card {
  background: rgba(15, 23, 42, 0.8); /* slate-900 with opacity */
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
}
```

---

## Component Patterns

### 1. Bead (Task Card)

The fundamental unit - a task represented as a glass bead on a wire.

```tsx
interface BeadProps {
  color: string;           // Bead's primary color (hex)
  priority: 'low' | 'medium' | 'high';
  glowIntensity: number;   // 0-1, affects shadow spread
  title: string;
  description: string;
  tags: string[];
}

// Visual structure:
┌─────────────────────────────────────┐
│  ●  ← Bead indicator (floats above) │
│  ┌───────────────────────────────┐ │
│  │ Task Title                    │ │
│  │ Description text...           │ │
│  │ #tag1 #tag2                   │ │
│  │ ● low priority                │ │
│  └───────────────────────────────┘ │
└─────────────────────────────────────┘
```

**Key styling:**

- Gradient radial glow on bead indicator (light top-left, dark bottom-right)
- Priority-based shadow glow on entire card
- Scale transform on hover (1.02x)
- Opacity reduction during drag (0.5)

### 2. Wire Track (Column)

Columns represent "wires" that beads slide along.

```tsx
interface WireTrackProps {
  title: string;
  tasks: Bead[];
  isDragTarget: boolean;
}

// Visual structure:
       ╱
    ───●───  ← Wire connector (dashed line)
       ╲
┌─────────────────────────────────┐
│ Column Title          [count]   │
│ ─────────────────────────────── │  ← Track line (gradient)
│                                  │
│         [Bead 1]                │
│         [Bead 2]                │
│                                  │
│         (empty state)            │
└─────────────────────────────────┘
```

**Key styling:**

- Vertical gradient line through center (wire metaphor)
- Dashed connector to header wire
- Border highlight when drag-over (violet-500/50)
- Empty state shows ghost bead icon

### 3. Connector Wires

Visual metaphors linking columns to a central "abacus frame":

```css
.wire-connector {
  stroke: rgba(255, 255, 255, 0.15);
  stroke-dasharray: 4 4;
  animation: wirePulse 2s ease-in-out infinite;
}

@keyframes wirePulse {
  0%,
  100% {
    opacity: 0.15;
  }
  50% {
    opacity: 0.3;
  }
}
```

---

## Interaction Patterns

### Drag & Drop

**States:**

1. **Idle**: Card sits on wire, subtle shadow
2. **Hover**: Card scales up (1.02x), glow intensifies
3. **Drag Start**: Card shrinks (0.95x), opacity drops (0.5)
4. **Drag Over**: Target border glows violet (shadow-purple-500/10)
5. **Drop**: Animate into position, update column

```tsx
onDragStart: Set draggedTask, apply drag styles
onDragOver: Set dragOverColumn, highlight target
onDragLeave: Clear dragOverColumn, remove highlight
onDrop: Move task to new column, animate settle
```

### Hover Effects

```css
/* Bead hover */
.bead-card:hover {
  transform: scale(1.02);
  box-shadow: 0 0 30px var(--bead-color, 0.4);
}

/* Column hover */
.wire-track:hover {
  border-color: rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.03);
}

/* Button hover */
.btn-primary:hover {
  box-shadow: 0 10px 20px rgba(139, 92, 246, 0.25);
  transform: scale(1.05);
}
```

---

## Layout Patterns

### Header

```
┌─────────────────────────────────────────────────────────────┐
│  ●[logo]  Beadworks          [● 6 tasks active] [+ New Task] │
│           Agent Orchestration                                │
└─────────────────────────────────────────────────────────────┘
```

- Left: Logo + branding (bead icon with pulsing status dot)
- Right: Live task counter + primary action button
- Background: Glass with bottom border

### Kanban Board

```
┌─────────┬─────────┬────────────┬─────────┬─────────┐
│Backlog  │ Ready   │In Motion   │ Polish  │Complete │
│   [0]   │   [2]   │    [1]     │   [2]   │   [1]   │
│         │         │            │         │         │
│         │  ●●     │    ●       │  ●●     │   ●     │
└─────────┴─────────┴────────────┴─────────┴─────────┘
```

- 5 columns with consistent spacing (gap-6)
- Each column: min-w-[280px] max-w-[340px]
- Track line runs vertical center
- Tasks stack with gap-3

### Footer

```
┌─────────────────────────────────────────────────────────────┐
│ ● System Active  |  Last sync: just now  |  Press ? for ... │
└─────────────────────────────────────────────────────────────┘
```

- Fixed position at bottom
- Glass background (slate-950/80)
- Small text (JetBrains Mono 11px)
- Status indicators, sync info, keyboard hints

---

## Animation Patterns

### Page Load

Staggered fade-in with cascade effect:

```css
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.column-1 {
  animation: fadeInUp 0.5s ease-out 0s;
}
.column-2 {
  animation: fadeInUp 0.5s ease-out 0.1s;
}
.column-3 {
  animation: fadeInUp 0.5s ease-out 0.2s;
}
.column-4 {
  animation: fadeInUp 0.5s ease-out 0.3s;
}
.column-5 {
  animation: fadeInUp 0.5s ease-out 0.4s;
}
```

### Ambient Background

Floating gradient orbs with pulse:

```html
<div class="fixed inset-0 pointer-events-none">
  <div
    class="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse"
  />
  <div
    class="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-1000"
  />
</div>
```

### Micro-interactions

- **Pulse**: Status dots, active indicators
- **Bounce**: New task button on hover
- **Float**: Bead indicators (3s ease-in-out infinite)
- **Glow**: Priority shadows pulse rhythmically

---

## Responsive Behavior

### Breakpoints

- **Desktop**: Full 5-column layout (1800px max-width)
- **Tablet**: Horizontal scroll for columns (overflow-x-auto)
- **Mobile**: Stack columns vertically (future enhancement)

### Adaptive Spacing

```css
/* Desktop */
.gap-6 {
  gap: 1.5rem;
}

/* Tablet/Laptop */
@media (max-width: 1400px) {
  .gap-4 {
    gap: 1rem;
  }
  .min-w-[280px] {
    min-width: 260px;
  }
}

/* Mobile */
@media (max-width: 768px) {
  .columns {
    flex-direction: column;
  }
  .min-w-[280px] {
    min-width: 100%;
  }
}
```

---

## Accessibility

### Focus States

```css
.focus-visible:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
}
```

### Keyboard Navigation

- `Tab`: Move between focusable elements
- `Space/Enter`: Activate buttons, toggle states
- `Escape`: Cancel drag operation
- `?`: Open keyboard shortcuts modal (planned)

### Screen Readers

```tsx
<button aria-label="Create new task">
  + New Task
</button>

<div
  role="region"
  aria-label="Task column: Ready, 2 tasks"
>
  ...
</div>
```

---

## Performance Patterns

### CSS Animations

Prefer CSS over JS for animations:

```css
/* ✅ Good: CSS-only */
@keyframes pulse {
  0%,
  100% {
    opacity: 0.4;
  }
  50% {
    opacity: 0.8;
  }
}

.animate-pulse {
  animation: pulse 2s ease-in-out infinite;
}
```

### Drag Optimization

- Use `transform` instead of `top/left` for position
- Apply `will-change: transform` during drag
- Remove drag styles immediately on drop

### Render Optimization

```tsx
// Memoize task cards to prevent unnecessary re-renders
const TaskCard = memo(({ task, onDragStart }: TaskCardProps) => {
  return (
    <div draggable onDragStart={() => onDragStart(task)}>
      ...
    </div>
  )
})
```

---

## Custom Properties

All theme values exposed as CSS variables for consistency:

```css
:root {
  /* Spacing */
  --bead-size: 32px;
  --card-radius: 12px;
  --column-gap: 24px;
  --task-gap: 12px;

  /* Animation */
  --transition-fast: 150ms ease;
  --transition-base: 300ms ease;
  --transition-slow: 500ms ease;

  /* Z-index layers */
  --z-background: -1;
  --z-wire: 0;
  --z-card: 10;
  --z-header: 50;
  --z-footer: 100;
  --z-modal: 1000;
}
```

---

## Extending the Design System

### Adding New Bead Colors

```css
/* 1. Define color variable */
--bead-urgency: #ff4757;

/* 2. Create glow variant */
.bead-glow-urgency {
  box-shadow: 0 0 30px rgba(255, 71, 87, 0.4);
}

/* 3. Use in component */
<Bead color="var(--bead-urgency)" glowClass="bead-glow-urgency" />
```

### Creating New Components

Follow these patterns:

1. Use glass-card for containers
2. Apply hover-scale for interactive elements
3. Add pulse animation for status indicators
4. Include wire connectors where appropriate
5. Maintain type hierarchy (Outfit + JetBrains Mono)

---

## Files Reference

- **Main UI**: `packages/ui/src/routes/index.tsx`
- **Styles**: `packages/ui/src/styles.css`
- **Root Layout**: `packages/ui/src/routes/__root.tsx`
- **Router**: `packages/ui/src/router.tsx`

---

## Design Principles Checklist

When adding new features, verify:

- [ ] Bead metaphor maintained (tasks feel like objects)
- [ ] Wire track visual language (columns, connectors)
- [ ] Glass morphism for depth (transparency, blur, borders)
- [ ] Priority-based glows (color-coded shadows)
- [ ] Typography hierarchy (Outfit for display, JetBrains Mono for code)
- [ ] Smooth animations (CSS preferred, transform-based)
- [ ] Interactive feedback (hover, drag, focus states)
- [ ] Ambient atmosphere (background gradients, floating elements)
- [ ] Accessibility (ARIA labels, keyboard nav, focus indicators)
- [ ] Performance (memo, transform animations, will-change)

---

## Future Enhancements

**Planned visual features:**

- Bead physics simulation (momentum when dragging)
- Particle trails on bead movement
- Sound effects for bead collisions (optional)
- Custom bead patterns (gradients, stripes, icons)
- Dark/light theme toggle with smooth transition
- User-customizable bead colors

**Planned interactions:**

- Multi-select with batch drag
- Swipe gestures on mobile
- Quick actions on right-click
- Task editing with modal overlay
- Filter/search bead by tag or title
- Zoom in/out for different bead sizes
