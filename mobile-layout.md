# Teacher Dashboard: Mobile Layout with Navigation

**Category**: Teacher Dashboard - Mobile App  
**Purpose**: Main mobile app layout with top bar, content area, and bottom navigation

## Description
A mobile-first app layout featuring a top app bar, scrollable main content area, and fixed bottom navigation with three tabs (Plan, Class, Profile).

## Key Features
- **Top App Bar**:
  - App logo with school icon
  - App title (Classroom Companion)
  - Notification button with hover effect
  - Primary blue background
- **Main Content Area**:
  - Scrollable content area
  - Empty state component with illustration
  - Welcome message for teacher
  - "Start a Lesson" call-to-action button
  - Helper hint text
- **Bottom Navigation Bar**:
  - Fixed at bottom with backdrop blur
  - Three tabs: Plan, Class, Profile
  - Active tab indicator (Class tab shown as active)
  - Icon animations on hover
  - Active state with filled icon and bold text
- **Visual Effects**:
  - Backdrop blur on navigation bar
  - Hover effects on all interactive elements
  - Active indicator background on selected tab
  - Shadow effects
  - Smooth transitions
  - Safe area padding for iOS

## Design Tokens
```javascript
colors: {
  primary: "#3c83f6",
  primary-dark: "#2563eb",
  background-light: "#f5f7f8",
  background-dark: "#101722",
  surface-light: "#ffffff",
  surface-dark: "#1e293b",
}
font: {
  display: ["Lexend", "sans-serif"]
}
borderRadius: {
  "DEFAULT": "0.5rem", 
  "lg": "1rem", 
  "xl": "1.5rem", 
  "2xl": "2rem",
  "full": "9999px"
}
```

## Component Structure
```
├── Top App Bar
│   ├── App Logo (School Icon)
│   ├── App Title (Classroom Companion)
│   └── Notification Button
├── Main Content Area
│   └── Empty State Component
│       ├── Illustration
│       ├── Welcome Message
│       ├── Description Text
│       └── Start Lesson Button
│   └── Helper Hint
└── Bottom Navigation Bar
    ├── Plan Tab (Inactive)
    ├── Class Tab (Active)
    │   ├── Active Indicator Background
    │   └── Filled Icon
    └── Profile Tab (Inactive)
```

## Usage Notes
- Bottom navigation is fixed at bottom
- Main content scrolls independently
- Active tab shows filled icon with indicator background
- Empty state shown when no active lesson
- Safe area padding for iOS devices
- Large touch targets for mobile
- Hover effects for desktop testing

## Accessibility
- Keyboard navigation through tabs
- Screen reader announcements for tab changes
- Focus indicators on all interactive elements
- ARIA labels for navigation items
- High contrast colors
- Proper heading hierarchy
- Large touch targets for motor accessibility
