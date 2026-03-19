# Student App: Listen & Tap

**Category**: Student App - Audio Comprehension Game  
**Purpose**: Students listen to audio and select correct image

## Description
A mobile-first screen for "Listen & Tap" comprehension exercises. Students hear audio and tap the matching image from a grid. Features large audio button, image grid, and progress tracking.

## Key Features
- **Audio Playback**: Large circular button with volume icon
  - Hover scale effect
  - Glow shadow on hover
- **Image Grid**: 2x2 grid of image options
  - Keyboard number hints (1, 2, 3, 4)
  - Selected state with checkmark badge
  - Hover border effects
- **Progress Tracking**: 
  - Exercise counter (4 of 5)
  - Progress bar with highlight effect
  - Lives/hearts counter
- **Mascot Avatar**: Friendly robot character in speech bubble
- **Instruction Prompt**: "Listen and select correct image"

## Design Tokens
```javascript
colors: {
  primary: "#0dccf2",
  primary-dark: "#0ab8da",
  background-light: "#f5f8f8",
  background-dark: "#111718",
  surface-dark: "#182224",
  border-dark: "#283639"
}
font: {
  display: ["Lexend", "sans-serif"],
  body: ["Noto Sans", "sans-serif"]
}
borderRadius: {
  lg: "2rem",
  xl: "3rem",
  2xl: "4rem",
  3xl: "2rem",
  full: "9999px"
}
```

## Component Structure
```
├── Header
│   ├── Close Button
│   └── Progress Bar
│       ├── Exercise Counter
│       └── Lives (Hearts)
├── Main Content
│   ├── Instruction Area
│   │   ├── Mascot Avatar
│   │   ├── Speech Bubble
│   │   └── Audio Button (Large)
│   └── Image Grid (2x2)
│       ├── Option 1 (Unselected)
│       ├── Option 2 (Selected + Checkmark)
│       ├── Option 3 (Unselected)
│       └── Option 4 (Unselected)
└── Footer
    └── Check Button
```

## Usage Notes
- Audio button is 96px (w-24) with glow effect
- Images use aspect-square with padding
- Selected state adds checkmark badge in top-right
- Keyboard hints show in top-left of each image
- Progress bar has gloss effect for visual appeal

## Accessibility
- Large touch targets for audio button
- Screen reader announcements for selection state
- Keyboard navigation through grid (1-4 keys)
- High contrast images with clear borders
