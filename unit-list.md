# Teacher Dashboard: Unit List (Modern Minimalist)

**Category**: Teacher Dashboard - Curriculum Management  
**Purpose**: Browse, search, and filter curriculum units with card-based layout

## Description
A web-based unit management screen with grid layout, search functionality, and status badges for managing curriculum units.

## Key Features
- **Unit Cards**:
  - Thumbnail image with hover zoom
  - Status badges (Active, Draft)
  - Level indicators (Beginner, Intermediate, Advanced)
  - CEFR level tags (A1, A2, B1, B2, C1)
  - Lesson count
  - Last updated timestamp
- **Header & Actions**:
  - Page title and description
  - New Unit button
- **Search & Filters**:
  - Search by title or keyword
  - Level filter dropdown
  - Status filter dropdown
  - View toggle (grid/list)
- **Pagination**:
  - Page navigation
  - Results counter
  - Previous/Next buttons
- **Navigation**:
  - Sidebar navigation
  - User profile
  - Sign out
- **Visual Effects**:
  - Card hover lift and shadow
  - Thumbnail zoom on hover
  - Status badge color coding
  - Gradient overlays on images

## Design Tokens
```javascript
colors: {
  primary: "#137fec",
  background-light: "#f6f7f8",
  background-dark: "#101922",
}
font: {
  display: ["Inter", "sans-serif"]
}
borderRadius: {
  "DEFAULT": "0.375rem",
  "lg": "0.5rem",
  "xl": "0.75rem",
  "full": "9999px"
},
```

## Component Structure
```
├── Sidebar Navigation
│   ├── App Logo + Title
│   ├── Nav Links (Dashboard, Units, Students, Library, Settings)
│   └── User Profile (Avatar + Name + Role)
├── Main Content Area
│   ├── Header
│   │   ├── Title ("Curriculum Units")
│   │   ├── Description
│   │   └── New Unit Button
│   ├── Search & Filters Bar
│   │   ├── Search Input (Icon + Placeholder)
│   │   ├── Filter Label + Icon
│   │   ├── Level Dropdown (All, Beginner, Intermediate, Advanced)
│   │   ├── Status Dropdown (Active, Draft, All)
│   │   └── View Toggles (Grid/List)
│   ├── Unit Grid
│   │   ├── Card 1 (Active)
│   │   │   ├── Thumbnail (Hover Zoom)
│   │   │   │   └── Status Badge (Active)
│   │   │   ├── Card Content
│   │   │   │   ├── Level Badges (Beginner, A1)
│   │   │   │   ├── Title ("Unit 1: Welcome to Class")
│   │   │   │   ├── Description (Line clamp 2)
│   │   │   │   └── Footer (Lessons, Updated)
│   │   │   └── Action Menu (Three Dots)
│   │   ├── Card 2 (Active)
│   │   │   ├── Thumbnail
│   │   │   │   └── Status Badge (Active)
│   │   │   ├── Card Content
│   │   │   │   ├── Level Badges (Beginner, A2)
│   │   │   │   ├── Title ("Unit 2: Daily Routines")
│   │   │   │   ├── Description
│   │   │   │   └── Footer
│   │   │   └── Action Menu
│   │   ├── Card 3 (Draft)
│   │   │   ├── Thumbnail
│   │   │   │   └── Status Badge (Draft, Yellow)
│   │   │   ├── Card Content
│   │   │   │   ├── Level Badges (Intermediate, B1)
│   │   │   │   ├── Title ("Unit 3: The Natural World")
│   │   │   │   ├── Description
│   │   │   │   └── Footer
│   │   │   └── Action Menu
│   │   ├── Card 4 (Active)
│   │   ├── Card 5 (Active)
│   │   └── Card 6 (Active)
│   └── Pagination
│       ├── Results Text ("Showing 1-6 of 24")
│       └── Page Navigation (Previous, 1, 2, 3, Next)
```

## Usage Notes
- Grid layout responsive (1-3 columns)
- Cards use hover lift and shadow effects
- Status badges color-coded (green=active, yellow=draft)
- Level badges use color coding (blue=beginner, purple=intermediate, pink=advanced)
- Thumbnails use 4:3 aspect ratio
- Search filters in real-time
- View toggle switches between grid and list layouts

## Accessibility
- High contrast status badges
- Screen reader announcements for filters
- Keyboard navigation through grid
- Focus states on all interactive elements
- Large touch targets for cards
- Alt text for all thumbnails
- Proper heading hierarchy
