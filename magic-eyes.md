# Classroom Board: Magic Eyes

**Category**: Classroom Board - Memory Recall Game  
**Purpose**: Visual memory game where students recall items after a brief flash

## Description
A classroom board screen for "Magic Eyes" memory exercises. Shows an image briefly, then hides it while students recall what they saw. Features timer controls and reveal functionality.

## Key Features
- **Image Flash**: Full viewport image display with blur effect when hidden
- **Timer System**: Circular or linear timer with visual urgency indicators
- **State Management**: Clear visible/hidden states with transitions
- **Student Prompt**: Large typography calling specific students by name
- **Reveal Controls**: Quick reveal and skip options for teacher
- **Score Display**: Class score tracking in header

## Design Tokens
```javascript
colors: {
  primary: "#0b2eda",
  background-dark: "#101322",
  surface-dark: "#1b1d27"
}
font: {
  display: ["Space Grotesk", "sans-serif"]
}
borderRadius: {
  lg: "2rem",
  xl: "3rem"
}
boxShadow: {
  glow: "0 0 40px -10px rgba(11, 45, 218, 0.3)",
  glow-strong: "0 0 60px -15px rgba(11, 45, 218, 0.6)"
}
```

## Component Structure
```
├── Header (Game HUD)
│   ├── Game Identity (Icon + Title)
│   ├── Score Pill
│   └── Exit Button
├── Main Viewport
│   ├── Image Layer (Blurred/Obscured state)
│   ├── Darkening Overlay
│   └── Center Icon/State Indicator
│   └── Timer Bar
└── Floating Control Dock
    ├── Re-Flash Button
    ├── Reveal Button
    └── Skip Button
```

## Usage Notes
- Image flash duration typically 3-5 seconds
- Blur effect increases difficulty for recall
- Teacher can reveal early if students are struggling
- Supports random student selection from class list

## Accessibility
- High contrast text overlays
- Large timer indicators for visibility
- Screen reader announcements for state changes
- Keyboard navigation for all controls
