# Student App: Home Map

**Category**: Student App - Progress Path  
**Purpose**: Gamified progress map showing unlocked levels and learning path

## Description
A mobile-first screen showing the student's learning journey as a path with nodes. Features unit sections, progress tracking, and gamified level design with stars and locks.

## Key Features
- **Unit Sections**: 
  - Active unit with full path and progress bar
  - Locked units with grayed-out path
- **Level Nodes**: 
  - Completed levels (star icons with 3-star ratings)
  - Active level (play button with pulse animation)
  - Locked levels (lock icons)
  - Review levels (book icon)
- **Progress Tracking**: 
  - Unit progress bars (e.g., 3/5)
  - XP indicators (+10 XP on active level)
  - Currency display (streak counter, gems counter)
- **Navigation**: 
  - Bottom tab bar (Home, Leaderboard, Quests, Profile)
  - Floating practice button (fitness center icon)
- **Visual Effects**:
  - Pulse animation on active level
  - Hover lift effects on level nodes
  - Glow effects on active level
  - Floating mascot decoration

## Design Tokens
```javascript
colors: {
  primary: "#58cc02", // Duo Green
  primary-dark: "#46a302",
  secondary: "#fbbf24", // Gold
  secondary-dark: "#d97706",
  background-light: "#ffffff",
  background-dark": "#131f24",
  surface-dark": "#18272a",
  surface-locked: "#e5e5e5", 
  locked-text: "#afafaf",
  "path-line": "#283639",
  "blue-highlight": "#1cb0f6",
  "blue-dark": "#1899d6",
  "pink-highlight": "#ff4b4b",
  "purple-highlight": "#ce82ff"
}
font: {
  display: ["Lexend", "sans-serif"],
  body: ["Noto Sans", "sans-serif"],
}
borderRadius: {"DEFAULT": "1rem", "lg": "2rem", "xl": "3rem", "2xl": "4rem", "full": "9999px"},
boxShadow: {
  'btn': '0px 4px 0 0 rgba(0,0,0,0.2)',
  'btn-primary': '0px 4px 0 0 #46a302',
  'btn-secondary': '0px 4px 0 0 #e5b400',
  'btn-blue': '0px 4px 0 0 #1899d6',
  'btn-locked': '0px 4px 0 0 #cecece',
  'btn-locked': '0px 4px 0 0 #cecece'
}
```

## Component Structure
```
├── Sticky Header
│   ├── Course Flag
│   ├── Currency Stats (Streak, Gems)
│   └── Bottom Nav (Home, Leaderboard, Quests, Profile)
├── Main Scrollable Content
│   ├── Unit Section (Header Card, Progress Bar, Path)
│   └── The Map Path
│       ├── Unit 1 (Completed, Locked)
│       ├── Level 1 (Completed, Star)
│       ├── Level 3 (Active, Play, Pulse, XP badge)
│       ├── Level 2 (Locked)
│       └── Level 4 (Locked)
│   └── Unit 2 (Locked)
└── Unit 2 (Locked)
└── Level 5 (Locked Chest)
├── Unit 2 Section (Locked)
│       └── Unit 2 (Locked)
└── Unit 2 (Locked)
└── Unit 2 (Locked)
└── Unit 2 (Locked)
└── Unit 2 (Locked)
└── Unit 2 (Locked)
└── Unit 2 (Locked)
└── Unit 2 (Locked)
└── Unit 2 (Locked)
└── Unit 2 (Locked)
└── Unit 2 (Locked)
└── Unit 2 (Locked)
└── Unit 2 (Locked)
└── Unit 2 (Locked)
└── Unit 2 (Locked)
└── Unit 2 (Locked)
└── Unit 2 (Locked)
└── Unit 2 (Locked)
└── Unit 2 (Locked)
└── Unit 2 (Locked)
└── Unit 2 (Locked)
└── Unit 2 (Locked)
└── Unit 2 (Locked)
└── Unit 2 (Locked)
└── Unit 2 (Locked)
```

## Usage Notes
- Path uses winding illusion with left/right offsets
- Active level has ping animation and bounce effect
- Currency stats in header always visible
- Floating practice button fixed bottom-right
- Bottom navigation with 4 tabs (Home, Leaderboard, Quests, Profile)
- Locked units have opacity 75

## Accessibility
- High contrast level indicators
- Screen reader announcements for unlock states
- Keyboard navigation through path
- Focus states on all interactive elements
- Large touch targets for mobile
