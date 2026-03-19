# Student App: Profile

**Category**: Student App - User Profile  
**Purpose**: Display student profile, stats, and dubbing studio gallery

## Description
A mobile-first profile screen showing student's avatar, level, XP, streak, league, and recent dubbing videos with customization options.

## Key Features
- **Profile Section**:
  - Editable avatar with camera overlay
  - Student name display
  - Level badge with class
  - Stats row (Streak, XP, League)
- **Primary Actions**:
  - Customize Avatar button
  - View Progress Report button
- **Dubbing Studio Section**:
  - Record New Dub button
  - Recent video thumbnails (4:5 aspect)
  - Video metadata (title, date)
  - Play and share buttons
- **Learning Path Link**:
  - Unit review card with gradient
  - Start button
- **Navigation**:
  - Back navigation
  - Settings button
  - Bottom navigation (Home, Learn, Profile, Shop)
- **Visual Effects**:
  - Hover lift on stats cards
  - Video thumbnail zoom on hover
  - Gradient overlays on thumbnails
  - Floating animation on record button

## Design Tokens
```javascript
colors: {
  primary: "#35da0b",
  primary-dark: "#2cb809",
  background-light: "#f6f8f5",
  background-dark: "#142210",
  text-main: "#121811",
  text-sub: "#698a60",
  border-color: "#dde6db"
}
font: {
  display: ["Lexend", "sans-serif"]
}
borderRadius: {
  "DEFAULT": "1rem", 
  "lg": "1.5rem", 
  "xl": "2rem", 
  "2xl": "2.5rem",
  "full": "9999px"
},
boxShadow: {
  "card": "0 4px 0 0 #dde6db",
  "btn": "0 4px 0 0 #2cb809",
  "btn-secondary": "0 4px 0 0 #e5e7eb"
}
```

## Component Structure
```
├── Header
│   ├── Back Button
│   ├── Page Title ("My Profile")
│   └── Settings Button
├── Main Scrollable Content
│   ├── Profile Info Section
│   │   ├── Avatar Container
│   │   │   ├── Avatar Image
│   │   │   ├── Edit Button Overlay
│   │   │   └── Camera Icon
│   │   ├── Student Name
│   │   ├── Level Badge (Level 5: Intermediate Speaker)
│   │   └── Stats Row
│   │       ├── Streak Card (Icon + Count + "Days")
│   │       ├── XP Card (Icon + Count + "XP")
│   │       └── League Card (Icon + Rank + "League")
│   ├── Primary Actions
│   │   ├── Customize Avatar Button (Primary, Hard Shadow)
│   │   └── View Progress Report Button (Secondary)
│   ├── Divider
│   ├── Dubbing Studio Section
│   │   ├── Section Header + "See all" Link
│   │   └── Video Grid (2 columns)
│   │       ├── Record New Dub Card (Dashed Border)
│   │       │   ├── Mic Icon Button
│   │       │   └── "Record New Dub" Label
│   │       ├── Video Card 1
│   │       │   ├── Thumbnail (Hover Zoom)
│   │       │   │   └── Gradient Overlay
│   │       │   ├── Video Info (Title, Date)
│   │       │   └── Action Buttons (Play, Share)
│   │       ├── Video Card 2
│   │       └── Video Card 3
│   └── Learning Path Link
│       ├── Gradient Card (Blue to Cyan)
│       │   ├── "Unit 4 Review" Text
│       │   ├── "Keep your streak alive!" Subtext
│       │   └── Start Button
└── Bottom Navigation (Mobile Style)
    ├── Home
    ├── Learn
    ├── Profile (Active, Notification Badge)
    └── Shop
```

## Usage Notes
- Avatar has edit button overlay on bottom-right
- Stats cards use icon + value + label layout
- Record New Dub card has dashed border and hover effect
- Video thumbnails use 4:5 aspect ratio
- Video cards have gradient overlay at bottom
- Learning Path card uses gradient background
- Bottom navigation with Profile tab highlighted

## Accessibility
- High contrast profile information
- Screen reader announcements for stats
- Keyboard navigation through cards
- Focus states on all interactive elements
- Large touch targets for mobile
- Alt text for avatars and video thumbnails
