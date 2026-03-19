# Classroom Board: Story Sequencing

**Category**: Classroom Board - Drag & Drop Game  
**Purpose**: Narrative ordering game where students arrange story cards in correct chronological order

## Description
A classroom board screen for "Story Sequencing" exercises. Students drag illustrated story cards from a jumbled area into a timeline in the correct order. Features drag-and-drop interactions with visual feedback.

## Key Features
- **Draggable Cards**: Story cards with images and text, grabbable with cursor indicators
- **Two-Panel Layout**: 
  - Jumbled cards area (horizontal scrollable)
  - Timeline drop zones (numbered slots)
- **Visual Feedback**: 
  - Hover states on cards
  - Active drop zone highlighting
  - Drag indicator icons
- **Progress Tracking**: Timer display and level indicator
- **Teacher Controls**: Reset and Check Answer buttons

## Design Tokens
```javascript
colors: {
  primary: "#0dccf2",
  background-dark: "#111718",
  surface-dark: "#1a2527",
  border-dark: "#283639"
}
font: {
  display: ["Lexend", "sans-serif"]
}
borderRadius: {
  xl: "1rem"
}
boxShadow: {
  glow: "0 0 20px rgba(13, 204, 242, 0.15)"
}
```

## Component Structure
```
├── Header
│   ├── Game Title + Icon
│   ├── Timer Display
│   ├── Reset Button
│   └── Level Indicator
├── Main Game Area
│   ├── Instructions Headline
│   ├── Jumbled Cards Area (Scrollable)
│   │   └── Draggable Story Cards (Image + Text)
│   ├── Arrow Divider
│   └── Timeline Drop Zones
│       └── Numbered Slots (1, 2, 3, 4...)
└── Floating Action Bar
    ├── Skip Button
    └── Check Answer Button
```

## Usage Notes
- Cards are 256px wide (w-64) with 160px image height
- Timeline uses numbered badges for slot identification
- Horizontal scroll for jumbled area on smaller screens
- Grid layout for timeline (2 cols mobile, 4 cols desktop)

## Accessibility
- Keyboard navigation for drag operations
- Screen reader announcements for card placement
- High contrast drop zone indicators
- Focus states for all interactive elements
