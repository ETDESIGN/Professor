# Classroom Board: Grammar Sandbox

**Category**: Classroom Board - Grammar Learning  
**Purpose**: Drag-and-drop word matching game for teaching nouns and verbs in a park scene

## Description
An interactive grammar learning game where students drag vocabulary words (nouns and verbs) to the correct objects in a park scene. Features visual feedback for correct/incorrect drops, progress tracking, and animations.

## Key Features
- **Header / HUD Layer**:
  - App icon with school icon
  - Activity title (Nouns & Verbs: The Park)
  - Instructions (Drag the words to the correct object)
  - Progress module (Found count / Total)
  - Progress bar with shadow effect
  - Sound toggle button
  - Reset Level button
- **The Stage (Scene)**:
  - Park background image
  - Gradient overlay for depth
  - Target zones for word placement
  - Interactive elements positioned on scene
- **Target Zones**:
  - Tree zone (completed state with checkmark)
  - Running zone (empty, waiting for verb)
  - Bench zone (empty, waiting for noun)
  - Visual indicators (dashed border, hover effects)
- **Word Bank (Bottom Tray)**:
  - Draggable word cards
  - Color-coded by part of speech (blue for verbs, white for nouns)
  - Icons for each word
  - Part of speech labels
  - Hover lift effects
- **Visual Feedback States**:
  - **Success**: Green border, checkmark badge, bounce animation, glow effect
  - **Error**: Red border, shake animation, error tooltip, close icon
  - **Empty**: Dashed border, drop zone label
  - **Hover**: Background color change, scale effect
- **Animations**:
  - Shake animation for error state (0.5s cubic-bezier)
  - Bounce animation for success (0.3s ease-out)
  - Hover lift effect (-translate-y-2)
  - Pulse animation for active zones
  - Ping animation for newly completed zones
  - Snap animation when word is placed

## Design Tokens
```javascript
colors: {
  primary: "#137fec",
  primary-dark: "#0b5cb5",
  background-light: "#f6f7f8",
  background-dark: "#101922",
  surface-dark: "#1e2936",
  success: "#22c55e",
  error: "#ef4444",
}
font: {
  display: ["Plus Jakarta Sans", "sans-serif"]
}
borderRadius: {
  "DEFAULT": "0.5rem", 
  "lg": "1rem", 
  "xl": "1.5rem", 
  "2xl": "2rem",
  "3xl": "2.5rem",
  "full": "9999px"
}
boxShadow: {
  'floating': '0 20px 40px -5px rgba(0, 0, 0, 0.4)',
  'card': '0 10px 20px -2px rgba(0, 0, 0, 0.2)',
}
```

## Component Structure
```
├── Header / HUD Layer
│   ├── App Icon + Title
│   ├── Instructions
│   ├── Progress Module
│   │   ├── Progress Text (1 / 4 Found)
│   │   └── Progress Bar
│   └── Actions (Sound, Reset Level)
├── The Stage (Scene)
│   ├── Background Image
│   ├── Gradient Overlay
│   └── Target Zones
│       ├── Tree Zone (Completed)
│       │   ├── Snapped Word Card
│       │   ├── Checkmark Badge
│       │   └── Success Glow
│       ├── Running Zone (Empty)
│       │   └── Drop Zone Label
│       └── Bench Zone (Empty/Error)
│           ├── Drop Zone Label
│           └── Error State (if wrong word dropped)
└── Word Bank (Bottom Tray)
    ├── Tab Handle
    └── Draggable Word Cards
        ├── Running (Verb)
        ├── Barking (Verb - with error tooltip)
        ├── Bench (Noun)
        └── Dog (Noun)
```

## Usage Notes
- Drag words from bottom tray to target zones
- Color-coded cards: Blue for verbs, White for nouns
- Correct drops show green border with checkmark
- Incorrect drops trigger shake animation with error message
- Progress bar updates as words are found
- Reset Level button returns all words to tray
- Sound toggle for audio feedback
- Hover effects indicate interactive elements
- Large touch targets for classroom use
- Visual feedback for all interactions

## Accessibility
- Keyboard drag-and-drop support
- Screen reader announcements for correct/incorrect drops
- Focus indicators on all draggable elements
- ARIA labels for all interactive elements
- High contrast colors for feedback states
- Large touch targets for motor accessibility
- Proper heading hierarchy
- Alt text for background image
- Error messages are announced to screen readers
