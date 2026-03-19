# Parent App: Dubbing Video Gallery

**Category**: Parent App - Content Viewing  
**Purpose**: Gallery view of child's video dubbing creations with sharing and management

## Description
A mobile-first gallery screen displaying all video dubbing projects created by the student. Features video thumbnails, scores, sharing options, and filtering capabilities.

## Key Features
- **Video Cards**:
  - Large aspect ratio thumbnails (4:5)
  - Score badges (e.g., 98/100)
  - Play button overlay with hover effects
  - Video metadata (title, date, level)
  - Action bar (Share, Save, Details)
- **Filtering System**:
  - Filter chips (Recent, Best Score, Level 1, Level 2)
  - Horizontal scrolling filter bar
- **Stats Section**:
  - Monthly achievements counter
  - Total videos created display
- **Navigation**:
  - Back navigation to parent dashboard
  - Child profile link
  - Bottom navigation (Home, Progress, Gallery, Settings)
- **Visual Effects**:
  - Thumbnail zoom on hover
  - Play button scale animation
  - Gradient overlays on thumbnails
  - Blur backdrop on badges

## Design Tokens
```javascript
colors: {
  primary: "#0dccf2",
  background-light: "#f5f8f8",
  background-dark: "#111718",
  surface-dark: "#1b2527",
  surface-highlight: "#283639",
}
font: {
  display: ["Lexend", "sans-serif"]
}
borderRadius: {"DEFAULT": "1rem", "lg": "2rem", "xl": "3rem", "full": "9999px"},
```

## Component Structure
```
├── Sticky Header
│   ├── Back Button
│   ├── Page Title ("Leo's Studio")
│   └── Child Profile Avatar
├── Main Scrollable Content
│   ├── Stats Card
│   │   ├── Monthly Achievements
│   │   └── Videos Created Counter
│   ├── Filter Chips Bar
│   │   ├── Recent (Active)
│   │   ├── Best Score
│   │   ├── Level 1
│   │   └── Level 2
│   └── Video Gallery Grid
│       ├── Video Card 1
│       │   ├── Thumbnail with Play Overlay
│       │   │   ├── Score Badge
│       │   │   ├── Play Button
│       │   │   └── Gradient Overlay
│       │   ├── Video Info (Title, Date)
│       │   └── Action Bar (Share, Save, Details)
│       ├── Video Card 2
│       └── Video Card 3
└── Bottom Navigation
    ├── Home
    ├── Progress
    ├── Gallery (Active)
    └── Settings
```

## Usage Notes
- Video thumbnails use 4:5 aspect ratio
- Score badges positioned top-right
- Play button centered on thumbnail
- Filter chips horizontally scrollable
- Action bar below each video card
- Gallery uses vertical scroll with cards stacked
- Bottom navigation with Gallery tab highlighted

## Accessibility
- High contrast video thumbnails
- Screen reader announcements for video metadata
- Keyboard navigation through gallery
- Focus states on all interactive elements
- Large touch targets for mobile
- Alt text for all video thumbnails
