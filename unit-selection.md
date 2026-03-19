# Classroom Board: Unit Selection

**Category**: Classroom Board - Lesson Launcher  
**Purpose**: Teacher selects which unit to launch for live class mode

## Description
A classroom board screen for "Unit Selection" - the landing page where teachers choose which lesson to display on the main projector. Features featured resume card, search/filter functionality, and unit grid.

## Key Features
- **Featured Card**: Large hero card showing most recent activity
  - Resume badge with history icon
  - Launch Live Mode button
  - Preview button
- **Search Bar**: Full-width search with icon
- **Filter Chips**: Horizontal scrollable filter pills
  - All Units, Book 1, Book 2, Grammar, Vocab
- **Unit Grid**: Responsive grid of unit cards
  - Status badges (COMPLETED, IN REVIEW, LOCKED)
  - Hover lift effects
  - Lesson count display
  - Play button on each card
- **Floating Action**: Quick launch button on mobile

## Design Tokens
```javascript
colors: {
  primary: "#0d59f2",
  background-light: "#f5f6f8",
  background-dark: "#101622",
  surface-light: "#ffffff",
  surface-dark: "#1b1f27"
}
font: {
  display: ["Lexend", "sans-serif"]
}
borderRadius: {
  xl: "1rem",
  2xl: "2rem"
}
```

## Component Structure
```
├── Header
│   ├── School Icon + Title
│   ├── Teacher Dashboard Info
│   └── Profile Avatar
├── Page Heading & Filters
│   ├── Live Session Badge
│   ├── Unit Title (Massive)
│   ├── Description
│   ├── Search Bar
│   └── Filter Chips (Scrollable)
├── Featured Card (Resume)
│   ├── Image Side
│   │   ├── Resume Badge
│   │   └── Gradient Overlay
│   └── Content Side
│       ├── Most Recent Label
│       ├── Unit Title
│       ├── Description
│       └── Action Buttons (Launch, Preview)
├── Unit Grid
│   └── Unit Cards
│       ├── Image (with Status Badge)
│       ├── Unit Number + Title
│       ├── Description
│       ├── Status Bar (Time, Lessons)
│       └── Play Button
└── Floating Action Button (Mobile)
```

## Usage Notes
- Featured card uses 2/5 width on desktop, full on mobile
- Unit grid responsive: 1 col mobile, 2 cols tablet, 3 cols desktop
- Status badges use high contrast colors
- Locked units have opacity 75, hover brings to 100

## Accessibility
- High contrast status badges
- Keyboard navigation through grid
- Screen reader announcements for filter changes
- Focus indicators on all interactive elements
