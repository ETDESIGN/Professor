# Classroom Board: Game Arena

**Category**: Classroom Board - Team Competition  
**Purpose**: Interactive team competition game with spin wheel and winner modal for classroom engagement

## Description
A team-based classroom competition game featuring a colorful spin wheel, team score tracking, and winner celebration modal. Designed for engaging classroom activities.

## Key Features
- **Top Navigation**:
  - App icon with game controller icon
  - App title (Classroom Arena)
  - Edit List button
  - Settings button
- **Red Team Sidebar**:
  - Team icon with swords
  - Team name (Red Team)
  - Score display (150 Points)
  - Add/Remove score buttons
  - Hover effects on buttons
- **Blue Team Sidebar**:
  - Team icon with shield
  - Team name (Blue Team)
  - Score display (140 Points)
  - Add/Remove score buttons
  - Hover effects on buttons
- **Center Stage (Wheel)**:
  - Colorful spin wheel with 6 segments
  - Student names on wheel segments
  - Wheel pointer at top
  - Decorative inner circle
  - Spin button with hover effect
  - Shadow effects
- **Winner Modal Overlay**:
  - Backdrop blur effect
  - Trophy icon with glow effect
  - Winner announcement
  - Student avatar card
  - Student name (Liam S.)
  - Team indicator (Red Team)
  - Dismiss and Next Spin buttons
  - Confetti animation (simulated)
- **Visual Effects**:
  - Gradient overlays
  - Shadow effects on cards
  - Hover lift effects
  - Smooth transitions
  - Confetti animation
  - Trophy glow effect
  - Backdrop blur on modal

## Design Tokens
```javascript
colors: {
  primary: "#137fec",
  background-light: "#f6f7f8",
  background-dark: "#101922",
}
font: {
  display: ["Plus Jakarta Sans", "sans-serif"]
}
borderRadius: {"DEFAULT": "1rem", "lg": "2rem", "xl": "3rem", "full": "9999px"},
```

## Component Structure
```
├── Top Navigation
│   ├── App Icon + Title
│   └── Actions (Edit List, Settings)
├── Main Content Area
│   ├── Red Team Sidebar
│   │   ├── Team Icon + Name
│   │   ├── Score Display (150 Points)
│   │   └── Score Controls (Add/Remove)
│   ├── Center Stage (Wheel)
│   │   ├── Wheel Pointer
│   │   ├── Spin Wheel
│   │   │   ├── 6 Colored Segments
│   │   │   ├── Student Names
│   │   │   └── Decorative Inner Circle
│   │   └── Spin Button
│   └── Blue Team Sidebar
│       ├── Team Icon + Name
│       ├── Score Display (140 Points)
│       └── Score Controls (Add/Remove)
└── Winner Modal Overlay
    ├── Close Button
    ├── Trophy Icon + Glow
    ├── Winner Announcement
    ├── Student Avatar Card
    │   ├── Avatar Image
    │   ├── Student Name (Liam S.)
    │   └── Team Indicator (Red Team)
    └── Actions (Dismiss, Next Spin)
```

## Usage Notes
- Spin wheel to randomly select students
- Track team scores with add/remove buttons
- Winner modal celebrates selected student
- Confetti animation for celebration
- Edit List button to modify wheel segments
- Settings button for game configuration
- Large touch targets for classroom use
- Hover effects on all interactive elements
- Backdrop blur on modal for focus

## Accessibility
- Keyboard navigation for all controls
- Screen reader announcements for winner
- Focus indicators on all interactive elements
- ARIA labels for all buttons
- High contrast colors for team indicators
- Large touch targets for motor accessibility
- Proper heading hierarchy
- Alt text for avatars
- Winner announcement for screen readers
- Keyboard support for spin button
