# Classroom Board: Speed Quiz

**Category**: Classroom Board - Timed Competition  
**Purpose**: Fast-paced quiz game with time pressure and scoring

## Description
A classroom board screen for "Speed Quiz" exercises. Students answer questions against a countdown timer. Features large question display, circular timer, and answer reveal functionality.

## Key Features
- **Large Question Display**: Massive typography (4xl to 6xl) for classroom visibility
- **Circular Timer**: SVG-based countdown with stroke animation
- **Image Card**: Visual context with gradient overlay
- **Answer Panel**: Reveals correct answer after time expires
- **Progress Tracking**: Round indicator and progress bar
- **Teacher Controls**: Replay, Pause, Next Question buttons

## Design Tokens
```javascript
colors: {
  primary: "#0dccf2",
  primary-hover: "#0ab8da",
  background-dark: "#101f22",
  card-dark: "#1b2527",
  accent-dark: "#283639"
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
├── Header
│   ├── Game Identity (Bolt Icon + Title)
│   ├── Team Score Display
│   └── Round Indicator
├── Main Content
│   ├── Question Headline (Massive Text)
│   └── Interactive Card Area
│       ├── Image Card (with Gradient Overlay)
│       ├── Timer Overlay
│       └── Answer Reveal Card
└── Footer Controls
    ├── Hint Button
    ├── Sound Toggle
    ├── Replay Button
    ├── Pause Button
    ├── Next Question Button
    └── Progress Bar
```

## Usage Notes
- Circular timer uses SVG stroke-dashoffset animation
- Timer urgency increases with pulse animation at low time
- Answer reveal card shows after timer expires or manual reveal
- Supports keyboard shortcuts for quick navigation

## Accessibility
- High contrast question text
- Large timer indicators for visibility
- Screen reader announcements for timer changes
- Focus states for all control buttons
