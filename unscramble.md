# Classroom Board: Unscramble

**Category**: Classroom Board - Word Arrangement Game  
**Purpose**: Grammar and vocabulary exercise where students arrange word bubbles to form correct sentences

## Description
A classroom board screen for "Unscramble" exercises. Students drag word bubbles from a word bank into a sentence construction area. Features playful bubble design with visual feedback.

## Key Features
- **Word Bubbles**: Large, pill-shaped buttons with hover lift effects
- **Two-Panel Layout**:
  - Drop zone (target sentence area)
  - Word bank (source area with shuffled words)
- **Visual Hierarchy**:
  - Dropped words have primary border
  - Empty slots show dashed placeholders
- **Progress Tracking**: Progress bar and timer display
- **Teacher Controls**: Reset and Check Answer buttons

## Design Tokens
```javascript
colors: {
  primary: "#0df259",
  background-light: "#f5f8f6",
  background-dark: "#102216",
  surface-light: "#ffffff",
  surface-dark: "#1c2e22"
}
font: {
  display: ["Lexend", "sans-serif"]
}
borderRadius: {
  xl: "3rem",
  full: "9999px"
}
boxShadow: {
  bubble: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
  bubble-hover: "0 10px 15px -3px rgba(0, 0, 0, 0.1)"
}
```

## Component Structure
```
├── Header
│   ├── Game Identity (Icon + Title)
│   ├── Progress Group
│   │   ├── Progress Bar
│   │   └── Timer Display
│   └── Controls (Reset, Settings)
├── Main Game Board
│   ├── Drop Zone (Target)
│   │   ├── Helper Text ("Drop Words Here")
│   │   ├── Dropped Word Bubbles
│   │   └── Empty Slot Placeholders
│   ├── Arrow Divider
│   └── Word Bank (Source)
│       └── Draggable Word Bubbles
└── Footer Action
    └── Check Answer Button
```

## Usage Notes
- Word bubbles scale on hover (-translate-y-1)
- Drop zone uses dashed borders for empty slots
- Word bank uses flex-wrap for responsive layout
- Supports keyboard shortcuts for quick navigation

## Accessibility
- Large, touch-friendly word targets
- Clear focus states for keyboard navigation
- Screen reader announcements for word placement
- High contrast text on all backgrounds
