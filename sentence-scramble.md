# Student App: Sentence Scramble Game

**Category**: Student App - Grammar Practice  
**Purpose**: Interactive word ordering game for sentence construction

## Description
A mobile-first gamified grammar game where students arrange scrambled words to form correct sentences. Features word bank, drop zone, and immediate feedback.

## Key Features
- **Game Interface**:
  - Mascot character with speech bubble
  - Target sentence display with translation
  - Audio playback for pronunciation
  - Progress bar showing completion
  - Lives/hearts counter
- **Word Bank**:
  - Scrambled word tiles
  - Drag-and-drop or tap-to-select
  - Used words appear as ghost tiles
  - Distractor words included
- **Answer Area**:
  - Drop zone for selected words
  - Animated cursor showing insertion point
  - Visual feedback on correct/incorrect
- **Success Feedback**:
  - Bottom sheet with celebration
  - "Excellent!" message
  - Continue button
  - Check button with hard shadow
- **Navigation**:
  - Close button
  - Keyboard shortcut button
  - Flag button for reporting
- **Visual Effects**:
  - Floating mascot animation
  - Hard shadow on buttons (game feel)
  - Bounce animation on success
  - Pulse animation on cursor

## Design Tokens
```javascript
colors: {
  primary: "#0df259",
  primary-dark: "#0bc449",
  background-light: "#f5f8f6",
  background-dark: "#102216",
  surface-light: "#ffffff",
  surface-dark: "#182e21",
}
font: {
  display: ["Plus Jakarta Sans", "sans-serif"]
}
borderRadius: {"DEFAULT": "1rem", "lg": "2rem", "xl": "3rem", "2xl": "1.5rem", "full": "9999px"},
boxShadow: {
  'hard': '0 4px 0 0',
  'hard-sm': '0 2px 0 0',
  'btn-hard-shadow': '0 4px 0 0 #e5e7eb',
  'btn-primary-shadow': '0 4px 0 0 #0bc449',
}
```

## Component Structure
```
├── Header
│   ├── Close Button
│   ├── Gamified Progress Bar
│   │   ├── Highlight effect
│   │   └── Progress indicator
│   └── Lives Counter (Hearts)
├── Main Scrollable Content
│   ├── Prompt Section
│   │   ├── Mascot (Floating animation)
│   │   └── Speech Bubble
│   │       ├── "Translate this sentence"
│   │       ├── Target Sentence
│   │       └── Audio Playback Button
│   ├── Answer Area (Drop Zone)
│   │   ├── Selected Word Tiles
│   │   │   ├── "The"
│   │   │   ├── "cat"
│   │   │   └── Animated Cursor
│   ├── Word Bank
│   │   ├── "is" (Active)
│   │   ├── "sleeping" (Ghost - Used)
│   │   ├── "mat" (Active)
│   │   ├── "on" (Active)
│   │   ├── "sleeping" (Active)
│   │   ├── "dog" (Distractor)
│   │   ├── "The" (Ghost - Used)
│   │   └── "cat" (Ghost - Used)
└── Footer / Action Area
    ├── Keyboard Button
    ├── "Tap tiles" Label
    ├── Flag Button
    └── Check Button (Primary, Hard Shadow)
└── Success Modal (Hidden by default)
    ├── Check Icon
    ├── "Excellent!" Message
    └── Continue Button
```

## Usage Notes
- Word tiles have hard shadow for game feel
- Ghost tiles show used words (transparent)
- Active tiles have hover effects
- Cursor shows where next word will go
- Check button has primary color and hard shadow
- Success modal slides up from bottom
- Progress bar shows completion percentage
- Lives displayed as heart icons

## Accessibility
- High contrast word tiles
- Screen reader announcements for word selection
- Keyboard navigation through word bank
- Focus states on all interactive elements
- Large touch targets for mobile
- Audio button with proper ARIA label
