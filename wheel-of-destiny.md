# Classroom Board: Wheel of Destiny

**Category**: Classroom Board - Random Selection  
**Purpose**: Fun randomizer for selecting students or topics

## Description
A classroom board screen for "Wheel of Destiny" random selection. Features a spinning wheel with student names or topics. Includes side panel for class management and winner display.

## Key Features
- **Spinning Wheel**: SVG-based wheel with colorful segments
  - 8 segments alternating colors
  - Central hub with primary accent
  - Smooth rotation animation
- **Wheel Indicator**: Arrow pointing to selected segment
- **Side Panel** (Desktop):
  - Student list with avatars
  - Add/edit student buttons
  - Remove student option
- **Winner Display**: Modal/card showing previous winner
  - Trophy icon
  - Winning streak counter
- **Controls**:
  - Spin button (oversized, prominent)
  - Settings toggle
  - Sound toggle
  - Menu (mobile)

## Design Tokens
```javascript
colors: {
  primary: "#0df259",
  primary-hover: "#0be052",
  background-light: "#f5f8f6",
  background-dark: "#102216",
  surface-light: "#ffffff",
  surface-dark: "#1a2c20",
  text-main: "#111813",
  text-sub: "#608a6e"
}
font: {
  display: ["Lexend", "sans-serif"]
}
borderRadius: {
  lg: "2rem",
  xl: "3rem",
  full: "9999px"
}
boxShadow: {
  soft: "0 4px 20px -2px rgba(0, 0, 0, 0.05)",
  glow: "0 0 15px rgba(13, 242, 89, 0.3)"
}
```

## Component Structure
```
├── Header
│   ├── Cyclone Icon + Title
│   └── Controls (Settings, Sound, Menu)
├── Main Content
│   ├── Wheel Container
│   │   ├── Indicator Arrow
│   │   └── SVG Wheel
│   │       ├── 8 Segments (alternating colors)
│   │       └── Central Hub
│   ├── Spin Button
│   │   └── "SPIN!" + Refresh Icon
│   └── Keyboard Hint
├── Side Panel (Desktop)
│   ├── Class List Header
│   └── Student Items
│       ├── Avatar + Name
│       └── Remove Button
└── Winner Modal (Bottom Left)
    ├── Gradient Top Bar
    ├── Trophy Icon
    ├── Winner Name
    └── Winning Streak
```

## Usage Notes
- Wheel segments: 8 student names or topics
- Spin button uses shadow for depth
- Side panel hidden on mobile, visible on lg screens
- Winner modal shows previous round result

## Accessibility
- Screen reader announcements for spin result
- Keyboard navigation (Spacebar to spin)
- Focus states on all interactive elements
- High contrast segment colors
