# Teacher Dashboard: Review Content

**Category**: Teacher Dashboard - Content Editing  
**Purpose**: Edit and verify AI-extracted lesson content

## Description
A web-based screen where teachers review and edit content extracted from textbook scans. Features split-view layout with source material preview, tabbed content editor, and drag-and-drop list management.

## Key Features
- **Split-View Layout**:
  - Left: Source material preview (scanned page)
  - Right: Content editor with tabs
- **Source Preview**: 
  - Scanned textbook page image
  - Zoom controls
  - Crop full button
  - Rescan option
- **AI Tip Card**: Helpful suggestions for content verification
- **Tabbed Content Editor**:
  - Vocabulary tab (12 items)
  - Grammar tab (3 items)
  - Resources tab (5 items)
  - Active tab with bottom border
- **Draggable List Items**: 
  - Drag handle indicator
  - Color-coded initial badges
  - Status badges (Verified, Review)
  - Hover reveal actions (edit, delete)
- **Content Stats**: Bottom bar showing totals and verification status

## Design Tokens
```javascript
colors: {
  primary: "#0df259",
  background-light: "#f5f8f6",
  background-dark: "#102216",
  surface-light: "#ffffff",
  surface-dark: "#1a2e22",
  border-light: "#dbe6df",
  border-dark: "#2a4535"
}
font: {
  display: ["Lexend", "sans-serif"],
  body: ["Noto Sans", "sans-serif"]
}
borderRadius: {
  xl: "2rem",
  2xl: "4rem",
  full: "9999px"
}
```

## Component Structure
```
├── Top Navigation
│   ├── User Profile
│   ├── Breadcrumbs
│   └── Actions (Notifications, Settings)
├── Sidebar Navigation
│   ├── Brand
│   ├── Nav Items
│   │   ├── Dashboard
│   │   ├── Classes
│   │   ├── Units (Active)
│   │   ├── Students
│   │   └── Library
│   └── AI Assistant Card
│       ├── Auto-awesome Icon
│       └── Status Message
│   └── User Profile
└── Main Content Area
    ├── Page Heading & Actions
    │   ├── Title + Status
    │   ├── Save Draft Button
    │   └── Publish Unit Button
    └── Split View Container
        ├── Left Column (Source Material)
        │   ├── Section Header
        │   ├── Image Preview
        │   ├── Zoom Controls
        │   └── AI Tip Card
        └── Right Column (Content Editor)
            ├── Tabs (Vocabulary, Grammar, Resources)
            └── Scrollable List
                └── Draggable Items
                    ├── Drag Handle
                    ├── Initial Badge
                    ├── Title + Type Badge
                    ├── Description
                    ├── Status Badge
                    └── Hover Actions (Edit, Delete)
            └── Bottom Stats Bar
                ├── Total Count
                └── Verification Status
```

## Usage Notes
- Split view responsive: stacks on mobile, side-by-side on lg screens
- List items use cursor-grab for drag indication
- Status badges use high contrast colors (green = Verified, yellow = Review)
- Tabs show item counts in badges

## Accessibility
- High contrast status badges
- Keyboard navigation through list items
- Screen reader announcements for tab changes
- Focus states on all interactive elements
- Large touch targets for drag handles
