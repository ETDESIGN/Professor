# Classroom Board: I Say, You Say

**Category**: Classroom Board - Repetition Practice  
**Purpose**: Whole-class audio repetition activity where students repeat phrases after teacher

## Description
A classroom board screen for "I Say, You Say" repetition exercises. Features large text display with emphasis on target vocabulary, audio playback controls, and visual context images.

## Key Features
- **Large Typography**: Massive text (clamp 3rem to 6rem) for classroom visibility
- **Visual Context**: Image card with activity status badge
- **Audio Controls**: Replay button with prominent play icon
- **Progress Tracking**: Visual progress bar with current/total indicators
- **Teacher Controls**: Previous/Next navigation with keyboard shortcuts
- **Emphasis Styling**: Primary color highlighting for target vocabulary

## Design Tokens
```javascript
colors: {
  primary: "#0dccf2",
  background-dark: "#101f22",
  surface-dark: "#1a2c30"
}
font: {
  display: ["Lexend", "sans-serif"]
}
borderRadius: {
  xl: "0.75rem",
  2xl: "1rem"
}
```

## Component Structure
```
├── Header (Top Navigation)
│   ├── Unit indicator
│   └── Class mode badge
├── Main Activity Area
│   ├── Context Image (Background/Card)
│   └── Text Display (Emphasized target)
└── Footer (Teacher Controls)
    ├── Navigation (Prev/Next)
    ├── Replay Button
    └── Progress Indicator
```

## Usage Notes
- Designed for projector display (1920x1080 minimum recommended)
- Supports keyboard shortcuts for navigation
- Audio playback should sync with text highlighting
- Progress updates automatically after each repetition

## Accessibility
- High contrast text for distant viewing
- Large touch targets for teacher controls
- Screen reader announcements for audio state changes
