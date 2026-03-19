# Teacher Dashboard: Review Content Unit (AI Integrated)

**Category**: Teacher Dashboard - Content Review  
**Purpose**: Review and approve AI-generated lesson content with vocabulary, grammar, and resources

## Description
A web-based content review screen where teachers can approve, edit, or reject AI-generated vocabulary, grammar, and resources for lesson units.

## Key Features
- **Content Review Cards**:
  - Vocabulary word with definition
  - AI-generated image with preview
  - TTS pronunciation audio player
  - Status badges (Pending, Approved)
  - Action buttons (Approve, Edit, Reject)
- **Asset Management**:
  - Regenerate image button
  - Upload custom image
  - Audio settings
  - Swap asset functionality
- **Progress Tracking**:
  - Overall enrichment progress bar
  - Assets approved counter
  - Last saved timestamp
- **Tabs Navigation**:
  - Context Video
  - Theme Art
  - Vocabulary (with count)
  - TTS Audio
- **Bulk Actions**:
  - Approve All Pending
  - Add Word button
  - Save Draft / Publish to Students
- **AI Insights**:
  - AI-generated suggestions highlighted
  - Related content recommendations
  - Processing status indicators

## Design Tokens
```javascript
colors: {
  primary: "#0df259",
  background-light: "#f5f8f7",
  background-dark: "#102216",
  "ai-accent": "#6366f1", // Indigo for AI
}
font: {
  display: ["Lexend", "Noto Sans", "sans-serif"],
  body: ["Noto Sans", "sans-serif"],
}
borderRadius: {"DEFAULT": "1rem", "lg": "2rem", "xl": "3rem", "full": "9999px"},
```

## Component Structure
```
├── Top Navigation
│   ├── Teacher Profile
│   ├── Nav Links (Dashboard, Units, Resources, Reports, Settings)
│   └── Notifications/Settings
├── Main Content Area
│   ├── Breadcrumbs & Header
│   │   ├── Unit Path (Textbooks > English for Kids Vol2 > Unit5)
│   │   ├── Page Title ("Review: Travel Plans")
│   │   └── Progress Card (65% complete)
│   ├── Tabs Navigation
│   │   ├── Context Video
│   │   ├── Theme Art
│   │   ├── Vocabulary (8) [Active]
│   │   └── TTS Audio
│   ├── Scrollable Content
│   │   ├── Toolbar
│   │   │   ├── Filter Label
│   │   │   ├── Add Word Button
│   │   │   └── Approve All Pending Button
│   │   ├── Vocabulary Card 1 (Pending)
│   │   │   ├── Word Info (Name, Part of Speech, Definition)
│   │   │   ├── AI Assets
│   │   │   │   ├── Image Asset (Preview, Regenerate, Replace)
│   │   │   │   └── Audio Asset (Play, Record)
│   │   │   └── Actions (Approve, Edit, Reject)
│   │   ├── Vocabulary Card 2 (Approved)
│   │   │   ├── Word Info (Name, Part of Speech)
│   │   │   ├── Previews (Image, Definition)
│   │   │   ├── Audio Button
│   │   │   └── Undo Approval Link
│   │   ├── Vocabulary Card 3 (Pending)
│   │   └── [More cards...]
│   │   └── Add New Vocabulary Item Button
│   └── Footer Stats
│       ├── Total Items Count
│       ├── Verified Count
│       └── Needs Review Count
└── Sticky Footer Actions
    ├── Last Saved Timestamp
    ├── Save Draft Button
    └── Publish to Students Button
```

## Usage Notes
- Pending cards have yellow badge and border highlight
- Approved cards have green badge and left border
- AI-generated items have "AI" badge
- Images have hover overlay with action buttons
- Audio player with waveform visualization
- Progress bar shows overall completion
- Footer actions always visible
- Regenerate button for AI assets
- Custom upload option available

## Accessibility
- High contrast status badges
- Screen reader announcements for status changes
- Keyboard navigation through cards
- Focus states on all interactive elements
- Large touch targets for actions
- Alt text for all images
- Audio controls with proper labels
