# Classroom Board: Layout

**Category**: Classroom Board - Main Interface  
**Purpose**: Main dashboard with timer, focus card, and quick tools for live classroom sessions

## Description
A web-based classroom interface showing current activity, session timer, noise level control, and quick teacher tools. Features large clock, focus card, and action buttons.

## Key Features
- **Top Bar**:
  - App logo with school icon
  - Room info (Room 3B, Ms. Frizzle)
  - Date display with calendar icon
  - Connection status indicator
- **Massive Clock**:
  - Digital timer display (HH:MM:SS format)
  - 12-hour format with AM/PM
  - Circular progress ring
  - Play/Pause/Add Time controls
- **Main Focus Card**:
  - Large activity preview
  - Current activity name (Silent Reading)
  - Chapter indicator (Chapter 3: The Reaction)
  - Page range (Pages 42-50)
  - Instructions summary
  - Progress bar (1/4 Found)
- **Quick Tools Panel**:
  - Noise Level indicator with slider
  - Group Work / Loud toggle
  - Lights button (with hover effect)
  - Help button (with hover effect)
- **Visual Effects**:
  - Floating decoration elements
  - Hover lift effects on buttons
  - Gradient overlays
  - Shadow effects on cards
  - Smooth transitions

## Design Tokens
```javascript
colors: {
  primary: "#137fec",
  secondary: "#fbbf24", // Sunshine Yellow
  accent: "#4ade80", // Frog Green
  danger: "#f87171", // Tomato Red
  background-light: "#f6f7f8",
  background-dark: "#101922",
}
font: {
  display: ["Lexend", "sans-serif"]
}
borderRadius: {"DEFAULT": "1rem", "lg": "1.5rem", "xl": "2rem", "2xl": "2.5rem", "full": "9999px"},
```

## Component Structure
```
├── Top Bar
│   ├── App Logo (School Icon + Title)
│   ├── Room Info (Room + Teacher Name)
│   └── Date (Calendar Icon + Date)
├── Main Content Area
│   ├── Massive Clock
│   │   ├── Timer Display (10:45 AM)
│   │   ├── Circular Progress Visualization
│   │   │   ├── Progress Ring
│   │   └── Controls (Pause, Add 5m)
│   └── Main Focus Card
│       ├── Chapter Badge (Top Left)
│       ├── Activity Name (Silent Reading)
│       ├── Page Info (Pages 42-50)
│       ├── Instructions Summary
│       └── Progress Bar (1/4 Found)
│   └── Quick Tools
│           ├── Noise Level Control
│           │   ├── Slider + Labels
│           │   └── Toggle (Group Work / Loud)
│           └── Action Buttons (Lights, Help)
└── Floating Action Button (Bottom Right)
        └── Teacher Tools (Grid View)
```

## Usage Notes
- Clock uses 12-hour format with AM/PM
- Progress ring shows completion percentage
- Main focus card shows current activity
- Quick tools have hover effects
- Floating action button always visible
- Cursor hidden wrapper for projector mode
- Large touch targets for classroom use
- Gradient overlays for visual depth

## Accessibility
- High contrast timer display
- Screen reader announcements for time updates
- Keyboard navigation through controls
- Focus states on all interactive elements
- Large touch targets for mobile
- Proper ARIA labels for all actions
