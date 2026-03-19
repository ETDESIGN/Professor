# Teacher Dashboard: Student Selector Modal

**Category**: Teacher Dashboard - Mobile App  
**Purpose**: Modal for selecting students to award points during live classroom sessions

## Description
A bottom sheet modal for selecting individual students or teams to award points. Features a toggle between Students and Teams views, with action buttons for different point values.

## Key Features
- **Modal Container**:
  - Bottom sheet design with rounded top corners
  - Drag handle for mobile swipe gesture
  - Backdrop blur effect
  - Full height on mobile, max-height on desktop
- **Header**:
  - Modal title (Award Points)
  - Close button
- **Toggle Switch**:
  - Students/Teams toggle
  - Active indicator background
  - Smooth transitions between states
- **Student Grid**:
  - 3-column grid layout (4 columns on larger screens)
  - Colorful gradient avatars
  - Selected state with checkmark badge
  - Hover scale effects
  - Student initials on avatars
- **Action Overlay**:
  - Shows selected student info
  - "Good Answer" button (+10 points)
  - "Super Star" button (+50 points)
  - "Try Again" button
  - Shimmer effect on hover
- **Visual Effects**:
  - Gradient avatars with different colors
  - Hover scale effects on student cards
  - Selected state with ring and checkmark
  - Shimmer effect on action buttons
  - Backdrop blur on modal
  - Smooth transitions

## Design Tokens
```javascript
colors: {
  primary: "#3c83f6",
  background-light: "#f5f7f8",
  background-dark: "#101722",
  success: "#22c55e",
  warning: "#f59e0b",
}
font: {
  display: ["Plus Jakarta Sans", "sans-serif"],
  body: ["Noto Sans", "sans-serif"],
}
borderRadius: {"DEFAULT": "1rem", "lg": "2rem", "xl": "3rem", "full": "9999px"},
```

## Component Structure
```
├── Modal Container
│   ├── Drag Handle (Mobile)
│   ├── Header
│   │   ├── Title (Award Points)
│   │   └── Close Button
│   ├── Toggle Switch
│   │   ├── Students Tab (Active)
│   │   └── Teams Tab (Inactive)
│   ├── Student Grid
│   │   ├── Student Card (Selected)
│   │   │   ├── Gradient Avatar
│   │   │   ├── Initials
│   │   │   └── Checkmark Badge
│   │   └── Student Cards (Unselected)
│   │       ├── Gradient Avatar
│   │       ├── Initials
│   │       └── Name
│   └── Action Overlay
│       ├── Selected Student Info
│       │   ├── Avatar
│       │   ├── Name (Jane Doe)
│       └── Action Buttons
│           ├── Good Answer (+10)
│           ├── Super Star (+50)
│           └── Try Again
```

## Usage Notes
- Toggle between Students and Teams views
- Tap student to select for awarding points
- Selected student shows ring and checkmark
- Action overlay appears after selection
- "Good Answer" awards 10 points
- "Super Star" awards 50 points
- "Try Again" clears selection
- Shimmer effect on action buttons for visual feedback
- Drag handle for swipe-to-close on mobile

## Accessibility
- Keyboard navigation through student grid
- Screen reader announcements for selection
- Focus indicators on all interactive elements
- ARIA labels for all buttons
- High contrast colors
- Large touch targets for motor accessibility
- Proper heading hierarchy
- Selected state announced to screen readers
