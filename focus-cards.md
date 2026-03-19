# Classroom Board: Focus Cards

**Category**: Classroom Board - Vocabulary Learning  
**Purpose**: Interactive flashcard system with 3D flip animations for vocabulary teaching

## Description
A web-based flashcard system featuring 3D flip animations, vocabulary cards with images, and pronunciation guides. Designed for classroom projection with large touch targets.

## Key Features
- **Top Navigation / Toolbar**:
  - App logo with school icon
  - Deck title (Vocabulary Deck: Fruits)
  - Shuffle button
  - Sound button
  - Restart button
- **Central Card Stage**:
  - 3D flip animation on hover/click
  - Front side: Large image with tap-to-reveal hint
  - Back side: Word, pronunciation, and part of speech
  - Smooth transitions
  - Perspective effects
- **Card Front**:
  - Large vocabulary image
  - "Tap to reveal" hint
  - Subtle bounce animation
- **Card Back**:
  - Large word display (Apple)
  - Pronunciation guide (/ˈapəl/)
  - Part of speech label (Noun)
  - "Tap again to hide" hint
  - Confetti decoration elements
- **Navigation Controls**:
  - Previous/Next buttons (large, circular)
  - Progress indicator (5 / 20)
  - Progress bar with animation
  - Keyboard shortcuts (Space, Arrow keys)
- **Visual Effects**:
  - 3D flip animation (0.6s cubic-bezier)
  - Perspective container (1000px)
  - Backface visibility hidden
  - Subtle bounce on image
  - Hover lift effects
  - Gradient overlays
  - Shadow effects

## Design Tokens
```javascript
colors: {
  primary: "#137fec",
  background-light: "#f6f7f8",
  background-dark: "#101922",
}
font: {
  display: ["Lexend", "sans-serif"]
}
borderRadius: {"DEFAULT": "1rem", "lg": "2rem", "xl": "3rem", "full": "9999px"},
animations: {
  'bounce-subtle': 'bounce-subtle 2s infinite',
  'flip': 'flip 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
}
```

## Component Structure
```
├── Top Navigation
│   ├── App Logo + Deck Title
│   └── Toolbar (Shuffle, Sound, Restart)
├── Main Content Area
│   ├── Navigation - Left (Previous Button)
│   ├── Central Card Stage
│   │   └── Card Container (3D Flip)
│   │       ├── Front Side
│   │       │   ├── Large Image
│   │       │   └── "Tap to reveal" Hint
│   │       └── Back Side
│   │           ├── Part of Speech (Noun)
│   │           ├── Large Word (Apple)
│   │           ├── Pronunciation (/ˈapəl/)
│   │           └── "Tap again to hide" Hint
│   └── Navigation - Right (Next Button)
└── Footer
    ├── Progress Info (5 / 20)
    ├── Progress Bar
    └── Keyboard Shortcuts (Space, ←, →)
```

## Usage Notes
- Card flips on hover or click
- Large touch targets for classroom use
- Smooth 3D flip animation
- Keyboard shortcuts available
- Progress tracking
- Shuffle button for random order
- Sound button for pronunciation
- Restart button to reset deck
- Perspective effects for 3D feel
- Backface visibility hidden for proper flip

## Accessibility
- Keyboard navigation (Space to flip, arrows to navigate)
- Screen reader announcements for card content
- Focus indicators on all interactive elements
- ARIA labels for navigation buttons
- Large touch targets for motor accessibility
- Proper heading hierarchy
- Alt text for images
- Pronunciation guide for audio support
