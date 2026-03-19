# Classroom Board: Story Stage

**Category**: Classroom Board - Storytelling  
**Purpose**: Comic-style story viewer with dialogue bubbles and panel navigation for interactive storytelling

## Description
A web-based comic book reader featuring zoomed-in panels, dialogue bubbles, and smooth transitions. Designed for classroom storytelling sessions with cinematic effects.

## Key Features
- **Header / Meta Layer**:
  - Chapter indicator with icon (Chapter 3: The Reaction)
  - Teacher tools toggle button
  - Fade-in animation
- **Cinematic Viewport**:
  - Full-screen comic page display
  - Zoomed-in panel effect (scale 1.6, translate)
  - Smooth transitions (800ms cubic-bezier)
  - Background blur effect
  - Rounded corners with shadow
- **Dialogue Bubble**:
  - Active speaker glow indicator (left border)
  - Speaker avatar with "SPEAKING" badge
  - Character name (Dr. Aris)
  - Large dialogue text
  - Backdrop blur effect
  - Shadow effects
- **Controls & Progress**:
  - Panel counter (Panel 4 of 12)
  - Progress bar with percentage (33%)
  - Previous/Next panel buttons
  - Play/Auto-advance button
  - Hover effects on controls
- **Visual Effects**:
  - Gradient overlays
  - Backdrop blur effects
  - Shadow effects on cards
  - Hover lift effects
  - Smooth transitions
  - Cinematic zoom effect
  - Active speaker glow

## Design Tokens
```javascript
colors: {
  primary: "#137fec",
  background-light: "#f6f7f8",
  background-dark: "#101922",
  surface-dark: "#192633",
  surface-dark-highlight: "#233648",
}
font: {
  display: ["Plus Jakarta Sans", "sans-serif"]
}
borderRadius: {"DEFAULT": "1rem", "lg": "2rem", "xl": "3rem", "full": "9999px"},
```

## Component Structure
```
├── Header / Meta Layer
│   ├── Chapter Indicator (Chapter 3: The Reaction)
│   └── Teacher Tools Toggle
├── Cinematic Viewport
│   ├── Background Blur Effect
│   └── Comic Page Container
│       └── Zoomed Panel (scale 1.6, translate)
└── Bottom UI Layer
    ├── Dialogue Bubble
    │   ├── Active Speaker Glow (Left Border)
    │   ├── Speaker Avatar + Badge
    │   ├── Character Name (Dr. Aris)
    │   └── Dialogue Text
    └── Controls & Progress
        ├── Progress Info (Panel 4 of 12, 33%)
        ├── Progress Bar
        └── Navigation (Prev, Play, Next)
```

## Usage Notes
- Comic pages displayed with zoom effect
- Smooth transitions between panels
- Dialogue bubbles with speaker identification
- Auto-advance feature for hands-free viewing
- Large touch targets for classroom use
- Cinematic feel with zoom and blur effects
- Progress tracking through story
- Teacher tools accessible via toggle

## Accessibility
- Keyboard navigation through panels
- Screen reader announcements for panel changes
- Focus indicators on all controls
- ARIA labels for navigation buttons
- High contrast dialogue text
- Large touch targets for motor accessibility
- Proper heading hierarchy
- Alt text for comic images
- Speaker announcements for screen readers
