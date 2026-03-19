# Classroom Board: Media Player

**Category**: Classroom Board - Video Content  
**Purpose**: Full-screen video player with karaoke-style lyrics overlay for classroom use

## Description
A web-based video player designed for classroom presentations with karaoke-style lyrics overlay, playback controls, and progress tracking.

## Key Features
- **Video Container**:
  - Full-screen video display
  - Play/pause overlay button
  - Background image for video placeholder
  - Smooth transitions
- **Header / Top Controls**:
  - Chapter icon with lightbulb
  - Video title (Solar System Exploration)
  - Chapter info (Chapter 4: The Gas Giants)
  - Exit Class button (with hover effect)
- **Karaoke Lyrics Overlay**:
  - Positioned in lower third
  - Current line highlighted (large, bold)
  - Next line shown subtly (smaller, faded)
  - Text stroke for readability
  - Smooth transitions between lines
- **Progress Bar**:
  - Time display (current / total)
  - Buffered progress indicator
  - Played progress indicator
  - Draggable handle
  - Hover effects
- **Playback Controls**:
  - Play/Pause button
  - Skip Previous/Next buttons
  - Volume control with slider
  - Karaoke toggle (Lyrics On/Off)
  - Settings button
  - Fullscreen button
- **Visual Effects**:
  - Gradient overlays
  - Backdrop blur effects
  - Shadow effects on controls
  - Hover lift effects
  - Smooth transitions

## Design Tokens
```javascript
colors: {
  primary: "#137fec",
  secondary-yellow: "#FFD700",
  secondary-green: "#4CAF50",
  secondary-red: "#FF6347",
  background-light: "#f6f7f8",
  background-dark: "#101922",
}
font: {
  display: ["Spline Sans", "sans-serif"]
}
borderRadius: {"DEFAULT": "0.25rem", "lg": "0.5rem", "xl": "0.75rem", "2xl": "1rem", "full": "9999px"},
```

## Component Structure
```
├── Video Container
│   ├── Video Background
│   └── Play Overlay (when paused)
├── Header / Top Controls
│   ├── Chapter Icon (Lightbulb)
│   ├── Video Title + Chapter Info
│   └── Exit Class Button
├── Karaoke Lyrics Overlay
│   ├── Current Line (Highlighted)
│   └── Next Line (Subtle)
└── Bottom Controls
    ├── Progress Bar
    │   ├── Time Display
    │   ├── Buffered Indicator
    │   └── Played Indicator
    └── Control Toolbar
        ├── Playback Controls (Play, Skip Prev/Next)
        ├── Volume Control
        ├── Karaoke Toggle
        ├── Settings Button
        └── Fullscreen Button
```

## Usage Notes
- Full-screen mode for classroom projection
- Karaoke lyrics can be toggled on/off
- Progress bar shows buffered and played portions
- Volume control with visual feedback
- Smooth transitions between lyrics
- Large touch targets for easy control
- Auto-hide controls when inactive (optional)
- Text stroke ensures lyrics readable on any background

## Accessibility
- Keyboard navigation for all controls
- Screen reader announcements for playback state
- Focus indicators on interactive elements
- ARIA labels for all buttons
- High contrast text for lyrics
- Proper color contrast ratios
- Pause/play announcements for screen readers
