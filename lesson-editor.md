# Teacher Dashboard: Lesson Editor (Plan Tab)

**Category**: Teacher Dashboard - Mobile App  
**Purpose**: Timeline-based lesson editor for planning and organizing lesson content

## Description
A mobile lesson editor featuring a vertical timeline with swipe-to-reveal actions, content cards with different states (Ready, Needs Review, Processing), and a bottom sheet for asset inspection.

## Key Features
- **Sticky Header**:
  - Back button
  - Unit and lesson title (Unit 1: The Zoo, Lesson 3)
  - Duration indicator (45 min)
  - Save button
  - Backdrop blur effect
- **Timeline Content**:
  - Vertical timeline with icon indicators
  - Timeline items with different states:
    - **Ready**: Green badge, success status
    - **Needs Review**: Yellow badge, warning status
    - **Processing**: Gray badge, loading spinner
  - Swipe-to-reveal "Regen" action
  - Drag handle for reordering
  - Thumbnail previews
  - Content type indicators (YouTube, Slides, Textbook)
- **Add New Placeholder**:
  - Dashed border drop zone
  - Add icon
  - "Drop items here" text
- **FAB (Floating Action Button)**:
  - "Scan Page" button
  - Camera icon
  - Fixed at bottom right
  - Hover lift effect
- **Bottom Sheet / Asset Inspector**:
  - Drag handle for swipe gesture
  - Asset preview (image/video)
  - "Generated" badge
  - Action buttons:
    - Search Web
    - AI Generate
  - Close button
- **Visual Effects**:
  - Swipe reveal animation
  - Hover scale effects on cards
  - Shadow effects
  - Backdrop blur on header and sheet
  - Gradient decorations
  - Loading spinner animation

## Design Tokens
```javascript
colors: {
  primary: "#3c83f6",
  background-light: "#f5f7f8",
  background-dark: "#101723",
  surface-dark: "#1e293b",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
}
font: {
  display: ["Plus Jakarta Sans", "sans-serif"]
}
borderRadius: {
  "DEFAULT": "0.5rem",
  "lg": "1rem",
  "xl": "1.5rem",
  "2xl": "2rem",
  "3xl": "2.5rem",
  "full": "9999px"
}
```

## Component Structure
```
├── Sticky Header
│   ├── Back Button
│   ├── Unit/Lesson Info
│   └── Save Button
├── Timeline Content
│   ├── Timeline Item 1 (Ready)
│   │   ├── Icon Indicator (Music Note)
│   │   └── Card
│   │       ├── Swipe Action (Regen)
│   │       ├── Thumbnail
│   │       ├── Details (Title, Duration)
│   │       ├── Status Badge (Ready)
│   │       └── Drag Handle
│   ├── Timeline Item 2 (Needs Review)
│   │   ├── Icon Indicator (School)
│   │   └── Card
│   │       ├── Swipe Action (Regen)
│   │       ├── Thumbnail
│   │       ├── Details (Title, Duration)
│   │       ├── Status Badge (Needs Review)
│   │       └── Drag Handle
│   ├── Timeline Item 3 (Processing)
│   │   ├── Icon Indicator (Book)
│   │   └── Card
│   │       ├── Thumbnail (Loading Spinner)
│   │       ├── Details (Title, Status)
│   │       └── Status Badge (Scanning...)
│   └── Add New Placeholder
│       ├── Add Icon
│       └── Drop Zone
├── FAB (Scan Page)
└── Bottom Sheet / Asset Inspector
    ├── Drag Handle
    ├── Header (Title, Size, Close)
    ├── Preview (Image/Video)
    ├── Generated Badge
    └── Action Buttons
        ├── Search Web
        └── AI Generate
```

## Usage Notes
- Swipe cards left to reveal "Regen" action
- Drag handle to reorder timeline items
- Different states: Ready (green), Needs Review (yellow), Processing (gray)
- FAB for scanning new content
- Bottom sheet for inspecting/editing assets
- "Search Web" to find alternative content
- "AI Generate" to create new content
- Sticky header stays visible while scrolling

## Accessibility
- Keyboard navigation through timeline
- Screen reader announcements for status changes
- Focus indicators on all interactive elements
- ARIA labels for all actions
- High contrast colors
- Large touch targets for motor accessibility
- Proper heading hierarchy
- Swipe gestures supported
