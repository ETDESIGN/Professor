# Classroom Board: Team Battle

**Category**: Classroom Board - Territory Competition  
**Purpose**: Team-based competitive game with territory claiming mechanics

## Description
A classroom board screen for "Team Battle" exercises. Two teams compete to claim territory on a grid by answering questions correctly. Features team scoring, turn indicators, and visual territory map.

## Key Features
- **Two-Column Layout**:
  - Left: Challenge/question panel with image
  - Right: Territory grid (3x3 battlefield)
- **Team Scoring**: 
  - Team Red vs Team Blue scores
  - Active turn indicator with pulse animation
  - VS badge in center
- **Territory Grid**: 9-cell grid with team ownership states
  - Red team cells (X markers)
  - Blue team cells (circle markers)
  - Empty cells (numbered)
  - Contested center cell (gold border)
- **Question Display**: Image with context and fill-in-the-blank sentence
- **Timer**: Countdown timer for answer period

## Design Tokens
```javascript
colors: {
  primary: "#0dccf2",
  primary-dark: "#0ab8da",
  background-dark: "#101f22",
  surface-dark: "#1a2c30",
  team-red: "#ef4444",
  team-blue: "#3b82f6"
}
font: {
  display: ["Lexend", "sans-serif"]
}
borderRadius: {
  lg: "0.75rem",
  xl: "1rem",
  2xl: "1.5rem"
}
```

## Component Structure
```
├── Header (Scoreboard)
│   ├── Game Identity (Icon + Title)
│   ├── Team Scores
│   │   ├── Team Red (Score)
│   │   ├── VS Badge
│   │   └── Team Blue (Score + Active Indicator)
│   └── Controls (Settings, Volume, Exit)
├── Main Game Area
│   ├── Left: Challenge Panel
│   │   ├── Badge (Grammar • Past Simple)
│   │   ├── Timer Display
│   │   ├── Question Image
│   │   ├── Question Text (with fill-in blank)
│   │   └── Teacher Actions (Skip, Reveal)
│   └── Right: Territory Map
│       ├── Grid (3x3 cells)
│       └── Turn Indicator Text
└── Footer Status
    ├── Room Info
    └── Connection Status
```

## Usage Notes
- Active team has underline and pulse animation
- Center cell (cell 5) is highly contested with gold border
- Correct answer claims a cell for the active team
- Team colors use high contrast for visibility

## Accessibility
- High contrast team colors (red/blue)
- Screen reader announcements for turn changes
- Keyboard navigation through grid cells
- Focus indicators on active team
