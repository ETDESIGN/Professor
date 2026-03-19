# Parent App: Dashboard

**Category**: Parent App - Progress Monitoring  
**Purpose**: Overview of child's learning progress, activities, and engagement

## Description
A mobile-first dashboard screen showing child's profile, learning statistics, recent activities, and weekly engagement graph for parents.

## Key Features
- **Child Profile Card**:
  - Child avatar with level badge
  - Child name and streak counter
  - XP progress bar (e.g., 750/1000)
  - League rank display
- **Stats Grid**:
  - Total XP counter
  - Time Learned tracker
  - Visual icons for each stat
- **Today I Learned Section**:
  - Topic header with icon
  - New vocabulary tags
  - Grammar focus with example
  - "Send Kudos" action button
- **Weekly Activity Graph**:
  - Bar chart showing daily learning time
  - Hover tooltips with time details
  - Active day highlighting
  - Day labels (M-Su)
- **Navigation**:
  - Parent profile in header
  - Notification bell with badge
  - Bottom navigation (Home, Reports, Connect, Settings)
- **Visual Effects**:
  - Gradient overlays on cards
  - Hover lift effects
  - Bar chart hover animations
  - Progress bar fill animation

## Design Tokens
```javascript
colors: {
  primary: "#0dccf2",
  background-light: "#f5f8f8",
  background-dark: "#101f22",
  surface: "#1a282b",
  surface-highlight: "#25363a",
}
font: {
  display: ["Lexend", "sans-serif"]
}
borderRadius: {"DEFAULT": "0.25rem", "lg": "0.5rem", "xl": "0.75rem", "2xl": "1rem", "full": "9999px"},
```

## Component Structure
```
├── Top Navigation
│   ├── Parent Profile (Avatar + Name)
│   └── Notification Bell (Badge)
├── Main Scrollable Content
│   ├── Headline
│   │   └── "Good Morning, Sarah!"
│   ├── Child Profile Card
│   │   ├── Decor Element (Gradient)
│   │   ├── Child Avatar + Level Badge
│   │   ├── Child Name + Streak
│   │   └── XP Progress Bar
│   ├── Stats Grid
│   │   ├── Total XP Card (Icon + Count)
│   │   └── Time Learned Card (Icon + Duration)
│   ├── Today I Learned Section
│   │   ├── Section Header (Icon + "Today I Learned")
│   │   ├── Card Header (Topic Icon + Title)
│   │   ├── Vocabulary Tags (Elephant, Giraffe, Lion, Zebra)
│   │   ├── Grammar Focus (Present Continuous + Example)
│   │   └── Send Kudos Button
│   └── Weekly Activity Graph
│       ├── Section Header
│       ├── Bar Chart Container
│       │   ├── Monday Bar (15m)
│       │   ├── Tuesday Bar (25m)
│       │   ├── Wednesday Bar (10m)
│       │   ├── Thursday Bar (45m)
│       │   ├── Friday Bar (30m)
│       │   ├── Saturday Bar (1h 5m) [Active]
│       │   └── Sunday Bar (5m)
└── Bottom Navigation
    ├── Home (Active)
    ├── Reports
    ├── Connect
    └── Settings
```

## Usage Notes
- Profile card uses gradient background
- XP progress bar shows percentage
- Stats cards use icon + value layout
- Today I Learned has expandable content
- Weekly graph uses bar chart with hover tooltips
- Active day (Saturday) has primary color
- Send Kudos button has icon + text
- Bottom navigation with Home tab highlighted

## Accessibility
- High contrast progress indicators
- Screen reader announcements for stats
- Keyboard navigation through cards
- Focus states on all interactive elements
- Large touch targets for mobile
- Alt text for avatars and icons
