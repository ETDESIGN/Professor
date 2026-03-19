# Teacher Dashboard: Live Commander

**Category**: Teacher Dashboard - Classroom Control  
**Purpose**: Real-time classroom control panel for managing live sessions

## Description
A web-based live classroom control interface with slide preview, navigation controls, teacher notes, student point management, and quick actions.

## Key Features
- **Slide Preview**:
  - Large projector-style display
  - Current slide indicator (e.g., "Interactive Exercise 3/15")
  - Fullscreen view button
  - Gradient overlay with controls
- **Navigation Controls**:
  - Previous/Next buttons with large touch targets
  - Emergency Skip button
  - Visual feedback on press
- **Teacher Notes Panel**:
  - Instructions list
  - Answer key section
  - Differentiation notes
  - Edit Notes button
- **Student Points Pad**:
  - Horizontal scrollable student list
  - Point display for each student
  - Quick +10 point buttons
  - Avatar initials display
- **Quick Actions**:
  - Spin Wheel randomizer
  - Attention/Quiet button
  - Timer display (elapsed time)
- **Navigation**:
  - Connection status indicator
  - Settings and WiFi buttons
  - Room display
- **Visual Effects**:
  - Pulse animation on attention button
  - Hover lift effects on controls
  - Active state highlighting
  - Gradient overlays

## Design Tokens
```javascript
colors: {
  primary: "#0d59f2",
  primary-hover: "#0b4ecf",
  background-light: "#f5f6f8",
  background-dark: "#101622",
  surface-light: "#ffffff",
  surface-dark: "#1a2230",
}
font: {
  display: ["Lexend", "sans-serif"]
}
borderRadius: {
  "DEFAULT": "0.5rem",
  "lg": "1rem",
  "xl": "1.5rem",
  "2xl": "2rem",
  "full": "9999px"
},
```

## Component Structure
```
├── Top Navigation Bar
│   ├── App Logo + Title ("Live Commander")
│   ├── Connection Status (Pulse + "Connected: Room 302")
│   ├── Timer Widget (00:45:12 Elapsed)
│   └── Actions (Settings, WiFi)
└── Main Content Area
    ├── Left Column: Preview & Navigation
    │   ├── Main Slide Preview Card
    │   │   ├── Header (Icon + "Now Showing" + Badge)
    │   │   ├── Slide Image Container
    │   │   │   ├── Background Image
    │   │   │   └── Overlay Controls
    │   │   │       ├── Current Slide Info
    │   │   │       └── View Full Button
    │   │   └── Navigation Controls
    │   │       ├── PREV Button (Large, Left Arrow)
    │   │       ├── Emergency Skip Button (Amber, "Skip" + Fast Forward)
    │   │       └── NEXT Button (Primary, Large, Right Arrow)
    └── Right Column: Teacher Notes
        └── Notes Card (Amber Background)
            ├── Header (Icon + "Teacher Notes" + Edit Link)
            ├── Scrollable Notes
            │   ├── Instructions Heading
            │   ├── Instructions List (Bullets)
            │   ├── Answer Key Section
            │   │   ├── Label
            │   │   └── Monospace Answer
            │   └── Differentiation
            │       ├── Heading
            │       └── Note
└── Fixed Bottom: Game Master Overlay
    ├── Spin Wheel Button
    │   ├── Icon Container (Rotates 180° on hover)
    │   ├── "Randomizer" Label
    │   └── "Spin Wheel" Text
    ├── Points Pad (Center, Scrollable)
    │   ├── Student Item 1 (Active)
    │   │   ├── Avatar Initials (Blue, Border)
    │   │   ├── Student Name
    │   │   ├── Points Count
    │   │   └── +10 Button (Green, Hover)
    │   ├── Student Item 2
    │   │   ├── Avatar Initials (Purple)
    │   │   ├── Student Name
    │   │   ├── Points Count
    │   │   └── +10 Button
    │   ├── Student Item 3 (Desktop)
    │   └── More Button
    └── Attention Button (Rose)
        ├── Icon Container (Ping Animation)
        ├── "Quiet" Label
        └── "Attention" Text
```

## Usage Notes
- Slide preview uses projector-style display
- Navigation buttons are large for easy classroom use
- Emergency Skip button for quick progression
- Teacher notes panel scrolls independently
- Points pad horizontally scrollable
- Spin Wheel button rotates icon on hover
- Attention button has ping animation
- Timer shows elapsed time in HH:MM:SS format
- Connection status with pulse indicator

## Accessibility
- High contrast control buttons
- Screen reader announcements for slide changes
- Keyboard navigation through controls
- Focus states on all interactive elements
- Large touch targets for classroom use
- Proper ARIA labels for all actions
- Timer announcements for time updates
