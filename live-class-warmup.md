# Classroom Board: Live Class Warm-Up

**Category**: Classroom Board - Video/Media Introduction  
**Purpose**: Class warm-up phase with video playback and vocabulary preview

## Description
A classroom board screen for "Live Class Warm-Up" activities. Teacher plays video/media to introduce lesson topic while students preview key vocabulary. Features video player, vocabulary chips, and activity launch button.

## Key Features
- **Video Player**: Large aspect-video player with custom controls
  - Play/pause overlay button
  - Volume control
  - Progress bar with time display
  - Replay button
- **Vocabulary Chips**: Horizontal scrollable list of key terms
  - Each chip has icon + text
  - Hover effects for engagement
- **Teacher Prompt**: Large headline with primary-colored topic indicator
- **Launch Button**: Oversized CTA to start main activity

## Design Tokens
```javascript
colors: {
  primary: "#0df259",
  background-light: "#f5f8f6",
  background-dark: "#102216",
  card-dark: "#182c20"
}
font: {
  display: ["Lexend", "sans-serif"],
  body: ["Noto Sans", "sans-serif"]
}
borderRadius: {
  lg: "0.5rem",
  xl: "0.75rem",
  2xl: "1rem"
}
```

## Component Structure
```
├── Header
│   ├── School Icon + Title
│   ├── Unit Time Remaining
│   └── Settings Button
├── Page Heading
│   ├── Warm Up Phase Badge
│   ├── Unit Title (Massive)
│   └── Back to Menu Button
├── Teacher Prompt
│   └── Headline with Primary Topic Indicator
├── Media Player (Hero)
│   ├── Video Container (aspect-video)
│   │   ├── Play Button Overlay
│   │   └── Progress Bar
│   └── Video Controls Bar
│       ├── Replay Button
│       ├── Volume Button
│       ├── Time Display
│       └── Start Activity Button
└── Vocabulary Chips
    └── Horizontal Scrollable List
        └── Chips (Icon + Text)
```

## Usage Notes
- Video uses custom controls for consistent styling
- Vocabulary chips use overflow-x-auto for horizontal scroll
- Start Activity button is oversized for emphasis
- Supports keyboard shortcuts for video controls

## Accessibility
- Large video player for visibility
- Screen reader announcements for vocabulary chips
- Focus states for all interactive elements
- High contrast text on video overlays
