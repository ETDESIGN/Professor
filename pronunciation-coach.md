# Student App: Pronunciation Coach

**Category**: Student App - Audio Recording & Feedback  
**Purpose**: Students practice pronunciation with real-time audio feedback

## Description
A mobile-first screen for pronunciation practice exercises. Students hear native audio, record themselves, and receive visual feedback on accuracy. Features waveform visualization and detailed scoring.

## Key Features
- **Sentence Display**: Large text with target vocabulary highlighted
  - Color-coded words (green for correct, red for issues)
  - IPA pronunciation guides on hover
- **Recording Visualization**: 
  - Waveform display showing audio levels
  - Color-coded bars (green = good, red = issues)
  - Playhead indicator showing current position
- **Score Display**: 
  - Percentage score with color coding
  - Specific feedback messages
- **Audio Controls**:
  - Listen to native audio
  - Record (hold to record)
  - Play back recording
  - Retry button

## Design Tokens
```javascript
colors: {
  primary: "#0dccf2",
  success: "#22c55e",
  error: "#ef4444",
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
```

## Component Structure
```
├── Header
│   ├── Back Button
│   ├── Level/Unit Info
│   └── More Options
├── Progress Bar
│   ├── Exercise Counter (4 of 5)
│   └── Percentage (80%)
├── Main Content
│   ├── Instruction Badge (Read this sentence aloud)
│   ├── Sentence Display
│   │   ├── Word-by-word with color coding
│   │   └── Hover IPA guides
│   └── Recording Visualization
│       ├── Waveform Bars
│       ├── Playhead Line
│       └── Time Display
└── Footer Controls
    ├── Listen Button (Native Audio)
    ├── Record Button (Primary, Oversized)
    └── Play Button (My Recording)
```

## Usage Notes
- Recording button uses hold gesture (press and hold)
- Waveform shows real-time audio levels
- Color coding: green bars = good pronunciation, red bars = issues
- Score updates after each recording attempt

## Accessibility
- Large touch targets for recording
- Screen reader announcements for recording state
- High contrast color coding for feedback
- Focus states for all interactive elements
