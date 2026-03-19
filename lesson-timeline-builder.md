# Teacher Dashboard: Lesson Timeline Builder

**Category**: Teacher Dashboard - Lesson Planning  
**Purpose**: Drag-and-drop timeline builder for creating lesson sequences

## Description
A web-based lesson planning interface with drag-and-drop activity library and timeline canvas. Teachers can build lesson sequences by dragging activities from a sidebar onto a timeline.

## Key Features
- **Activity Library Sidebar**:
  - Core Modules (Warm-up, Vocabulary, Grammar, Reading)
  - Gamification (Team Battle, Quiz Mode)
  - Search functionality
  - Drag handles on all items
- **Timeline Canvas**:
  - Vertical step sequence with numbered nodes
  - Drop zones for adding activities
  - Step cards with duration and type badges
  - Edit/delete actions on hover
- **Lesson Configuration**:
  - Lesson title input
  - Total time calculator (auto-sums step durations)
  - Step counter display
- **Activity Cards**:
  - Type icons and color coding
  - Duration display (e.g., 5m, 10m)
  - Activity type badges (Song, Flashcards, Practice)
  - Edit and delete buttons
- **Active Step Editing**:
  - Game mode selector
  - Duration slider
  - Team assignment
  - Advanced settings link
- **Visual Effects**:
  - Drag preview with dashed border
  - Hover lift effects
  - Active step highlighting
  - Connector lines between steps

## Design Tokens
```javascript
colors: {
  primary: "#0dccf2",
  primary-dark: "#0ab8da",
  background-light: "#f5f8f8",
  background-dark: "#101f22",
  surface-light: "#ffffff",
  surface-dark: "#1c2e33",
  border-light: "#dbe4e6",
  border-dark: "#2a3f45",
}
font: {
  display: ["Lexend", "sans-serif"]
}
borderRadius: {"DEFAULT": "0.25rem", "lg": "0.5rem", "xl": "0.75rem", "full": "9999px"},
```

## Component Structure
```
├── Top Navigation Bar
│   ├── App Logo + Title
│   ├── Nav Links (Dashboard, Lesson Builder, Library)
│   └── User Profile + Actions (Preview, Save Lesson)
├── Main Workspace
│   ├── Left Sidebar: Activity Library
│   │   ├── Search Input
│   │   ├── Category: Core Modules
│   │   │   ├── Warm-up Card (Draggable)
│   │   │   ├── Vocabulary Card (Draggable)
│   │   │   ├── Grammar Card (Draggable)
│   │   │   └── Reading Card (Draggable)
│   │   └── Category: Gamification
│   │       ├── Team Battle Card (Draggable)
│   │       └── Quiz Mode Card (Draggable)
│   └── Right: Timeline Canvas
│       ├── Breadcrumbs & Title Area
│       │   ├── Breadcrumb Path
│       │   ├── Lesson Title Input
│       │   └── Stats Card (Total Time: 50 mins)
│       └── Timeline Scroll Area
│           ├── Vertical Line Connector
│           ├── Step 1: Warm Up (Completed)
│           │   ├── Step Number Badge
│           │   └── Step Card (Type, Duration, Edit/Delete)
│           ├── Step 2: Vocabulary (Completed)
│           ├── Step 3: Game Time (Active/Editing)
│           │   ├── Step Number Badge (Primary)
│           │   └── Expanded Configuration
│           │       ├── Game Mode Select
│           │       ├── Duration Slider
│           │       ├── Team Avatars
│           │       └── Advanced Settings Link
│           ├── Step 4: Grammar (Completed)
│           ├── Step 5: Empty Drop Zone
│           ├── Step 6: Empty Drop Zone
│           └── Add Extra Step Button
└── Bottom Summary Bar (Mobile)
    ├── Total Duration Display
    └── Save Button
```

## Usage Notes
- Drag activities from sidebar to timeline
- Click step cards to expand configuration
- Duration slider updates total time automatically
- Active step has primary color and expanded panel
- Empty drop zones show dashed border
- Vertical line connects all steps
- Mobile has sticky bottom bar with summary

## Accessibility
- Drag and drop with keyboard support
- Screen reader announcements for drag states
- Focus states on all interactive elements
- High contrast step indicators
- Large touch targets for mobile
- ARIA labels for drag handles
