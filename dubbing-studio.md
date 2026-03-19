# Student App: Dubbing Studio

**Category**: Student App - Video Dubbing Practice  
**Purpose**: Students dub over video scenes with real-time audio feedback

## Description
A mobile-first screen for "Dubbing Studio" exercises. Students watch a video scene, then record themselves dubbing the dialogue. Features timeline visualization and dual-track audio comparison.

## Key Features
- **Video Preview**: Large video player with subtitle overlay
  - "Your Turn" badge with pulse animation
  - Target vocabulary highlighted with underline
- **Timeline Visualization**: 
  - Dual-track waveform display
  - Original audio track (gray bars)
  - User recording track (colored bars)
  - Playhead indicator
- **Recording Controls**:
  - Listen to original (headphones icon)
  - Record button (oversized, primary, with pulse ring)
  - Play back recording
- **Progress Tracking**: Scene counter (4 of 5) with percentage

## Design Tokens
```javascript
colors: {
  primary: "#0dccf2",
  background-dark: "#101f22",
  surface-dark: "#162a2e"
}
font: {
  display: ["Spline Sans", "sans-serif"]
}
borderRadius: {
  xl: "0.75rem",
  2xl: "1rem",
  3xl: "1.5rem"
}
animation: {
  'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite'
}
```

## Component Structure
```
├── Header
│   ├── Back Button
│   ├── Level/Unit Info
│   └── More Options
├── Progress Bar
│   ├── Scene Counter
│   └── Percentage
├── Main Content
│   └── Video Preview
│       ├── Video/Image Background
│       ├── Gradient Overlay
│       ├── Volume Button (Top Right)
│       └── Subtitle Overlay
│           ├── "Your Turn" Badge
│           └── Dialogue Text
└── Footer (Studio Controls)
    ├── Timeline Visualization
    │   ├── Time Display
    │   ├── Playhead Line
    │   ├── Original Audio Track (Waveform)
    │   └── User Recording Track
    └── Action Buttons
        ├── Listen (Headphones)
        ├── Record (Primary, Oversized, Pulse Ring)
        └── Play Recording
```

## Usage Notes
- Recording button uses hold gesture (press and hold to record)
- Timeline shows recorded portion in primary color
- Empty portion of user track shows what's yet to be recorded
- Video plays automatically when recording starts

## Accessibility
- Large touch targets for recording button
- Screen reader announcements for recording state
- High contrast text overlays on video
- Focus states for all interactive elements
