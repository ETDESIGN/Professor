# Teacher Dashboard: Lesson Studio

**Category**: Teacher Dashboard - Content Creation  
**Purpose**: Three-panel workspace for creating and editing lessons with source material, timeline, and asset inspector

## Description
A web-based lesson creation interface with three-column layout: source material viewer, timeline builder, and asset inspector with AI integration.

## Key Features
- **Column 1: Source Material**:
  - PDF viewer with page navigation
  - Highlighter tool for text selection
  - Zoom controls
  - Processing status indicator
- **Column 2: Timeline**:
  - Vertical step sequence
  - AI Found blocks (highlighted)
  - Needs Review blocks (orange border)
  - Standard activity blocks
  - Drag-and-drop reordering
  - Drop zones for new activities
- **Column 3: Asset Inspector**:
  - Current asset preview
  - Swap menu (Search, Upload, AI)
  - Web search results
  - AI Song Generator
  - Asset metadata display
- **Navigation**:
  - Top nav with app logo
  - Save Draft / Start Class buttons
- **AI Integration**:
  - AI Found badges on blocks
  - AI asset suggestions
  - Custom generation tools
- **Visual Effects**:
  - Panel hover effects
  - Active block highlighting
  - Asset preview zoom
  - Gradient overlays

## Design Tokens
```javascript
colors: {
  primary: "#0d59f2",
  background-light: "#f5f6f8",
  background-dark: "#101622",
  surface-light: "#ffffff",
  surface-dark: "#1a2230",
}
font: {
  display: ["Lexend", "sans-serif"]
}
borderRadius: {"DEFAULT": "0.25rem", "lg": "0.5rem", "xl": "0.75rem", "full": "9999px"},
```

## Component Structure
```
├── Top Navigation
│   ├── App Logo + Title ("Lesson Studio")
│   ├── Unit Subtitle
│   ├── Nav Links (Dashboard, My Lessons, Community)
│   └── Actions (Save Draft, Start Class)
└── Main Workspace (3-Column Grid)
    ├── Column 1: Source Material
    │   ├── Header
    │   │   ├── Title ("Source Material")
    │   │   └── Processed Badge
    │   ├── Toolbar
    │   │   ├── Select Tool
    │   │   ├── Highlighter (Active)
    │   │   ├── Zoom In
    │   │   └── Zoom Out
    │   └── PDF Content
    │       ├── Page Number
    │       ├── Unit Title
    │       ├── Vocabulary Section
    │       │   ├── Highlighted Word (Drag handle)
    │       │   │   ├── Definition
    │       │   │   └── Add Button
    │       │   ├── Word 2
    │       │   ├── Word 3
    │       │   └── Customs Section
    │       ├── Dialogue Section
    │       └── Image Placeholder
    ├── Column 2: Timeline
    │   ├── Header
    │   │   ├── Title ("Lesson Timeline")
    │   │   └── Time Estimate ("Est: 45 mins")
    │   └── Timeline Blocks
    │       ├── AI Found Block (Active)
    │       │   ├── Drag Handle
    │       │   ├── Type Badge (AI Found, Blue)
    │       │   ├── Duration ("5 mins")
    │       │   ├── Title ("Warm Up: Travel Song")
    │       │   ├── Source Label
    │       │   └── Chevron Right
    │       ├── Needs Review Block (Orange Border)
    │       │   ├── Drag Handle
    │       │   ├── Type Badge (Review, Orange)
    │       │   ├── Duration ("10 mins")
    │       │   ├── Title ("Intro: Vocabulary Definitions")
    │       │   └── Source Label
    │       ├── Standard Block
    │       │   ├── Drag Handle
    │       │   ├── Type Badge (Activity, Gray)
    │       │   ├── Duration ("15 mins")
    │       │   ├── Title ("Speaking Game: Roleplay")
    │       │   └── Source Label
    │       ├── AI Generated Block (Primary Border)
    │       │   ├── Drag Handle
    │       │   ├── Type Badge (AI Found, Blue)
    │       │   ├── Duration ("10 mins")
    │       │   ├── Title ("Video: Airport Security")
    │       │   └── Source Label
    │       └── Drop Zone (Dashed Border)
    │           ├── Add Circle Icon
    │           └── "Drag from source or add block"
    └── Column 3: Asset Inspector
        ├── Header
        │   ├── Title ("Inspector")
        │   └── Delete Button
        ├── Current Asset Preview
        │   ├── Asset Title ("Warm Up: Travel Song")
        │   ├── Subtitle ("Current Asset")
        │   ├── Type Badge (Music)
        │   └── Video Thumbnail
        │       ├── Play Button Overlay
        │       ├── Duration Badge
        │       └── Gradient Overlay
        └── Swap Menu
            ├── Header (Swap Asset)
            ├── Toggle Tabs (Search, Upload, AI)
            ├── Search Content
            │   ├── Search Input
            │   ├── "Web Results" Label
            │   └── Results Grid
            │       ├── Result 1 (Thumbnail, Title, Views, Duration)
            │       └── Result 2 (Thumbnail, Title, Views, Duration)
            └── AI Song Generator
                ├── Header + Icon
                ├── Description
                ├── Textarea (Prompt)
                └── Generate Button (With Credits)
```

## Usage Notes
- Three-column responsive layout
- Source panel with PDF viewer simulation
- Timeline shows step sequence with connectors
- AI Found blocks have blue highlighting
- Review blocks have orange left border
- Asset inspector shows selected block details
- Swap menu allows searching, uploading, or AI generation
- Web search results show thumbnails and metadata
- AI Song Generator with prompt input and credit cost

## Accessibility
- High contrast panel headers
- Screen reader announcements for block selection
- Keyboard navigation through timeline
- Focus states on all interactive elements
- Large touch targets for drag handles
- Alt text for all images and thumbnails
