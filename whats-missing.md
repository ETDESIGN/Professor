# Classroom Board: What's Missing?

**Category**: Classroom Board - Memory Recall Game  
**Purpose**: Visual memory game where students identify missing items from a set

## Description
A classroom board screen for "What's Missing?" memory exercises. Shows a grid of items with one hidden/missing. Students must recall and identify which item is absent. Features card grid with visual feedback.

## Key Features
- **Card Grid**: 2x2 or 4-column grid of item cards
- **Hidden State**: Special card with question mark and pulse animation
- **Visual Context**: Each card shows image and item name
- **Hover Effects**: Card lift and scale transitions
- **Teacher Controls**: Reveal answer and navigation buttons
- **Timer Display**: Countdown timer for recall phase

## Design Tokens
```javascript
colors: {
  primary: "#0b2eda",
  background-light: "#f5f6f8",
  background-dark: "#101322",
  surface-light: "#ffffff",
  surface-dark: "#1a1d2d"
}
font: {
  display: ["Lexend", "sans-serif"],
  body: ["Noto Sans", "sans-serif"]
}
borderRadius: {
  xl: "2rem",
  2xl: "2.5rem",
  3xl: "3rem"
}
boxShadow: {
  card: "0 10px 40px -10px rgba(0,0,0,0.08)",
  floating: "0 20px 40px -5px rgba(11, 46, 218, 0.15)"
}
```

## Component Structure
```
├── Header
│   ├── Game Identity (Icon + Title)
│   ├── Navigation Tabs (Home, Games, Reports)
│   └── User Profile
├── Main Game Stage
│   ├── Game Status/Header
│   │   ├── Phase Badge (Recall Phase)
│   │   ├── Headline
│   │   └── Timer Bar
│   └── Card Grid
│       ├── Visible Cards (Image + Name)
│       └── Missing Card (Question Mark + Animation)
└── Teacher Action Bar (Floating)
    ├── Settings Button
    ├── Shuffle Button
    ├── Reveal Answer Button
    └── Next Button
```

## Usage Notes
- Missing card uses pulse animation for attention
- Hover hint shows answer on teacher interaction
- Grid responsive: 2 cols mobile, 4 cols desktop
- Cards have consistent aspect ratio (4:3)

## Accessibility
- High contrast text on cards
- Screen reader announcements for card states
- Keyboard navigation through grid
- Focus indicators on missing card
