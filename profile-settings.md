# Teacher Dashboard: Profile Settings

**Category**: Teacher Dashboard - Mobile App  
**Purpose**: Main profile settings screen with account, preferences, and support options

## Description
A mobile profile settings screen featuring a profile header with avatar, grouped settings sections (Account, Preferences, Support), and a logout button.

## Key Features
- **Top App Bar**:
  - Profile title
  - Backdrop blur effect
- **Profile Header Section**:
  - Large avatar image with edit button
  - Teacher name (Mrs. Davis)
  - Teacher badge (Teacher)
  - Email address
- **Account Settings Group**:
  - Edit Profile button
  - Change Password button
  - Icon-based navigation
  - Hover effects
- **Preferences Group**:
  - Notifications button
  - Dark Mode toggle switch
  - Icon-based navigation
  - Toggle switch with animation
- **Support Group**:
  - Help Center button
  - Report Issue button
  - Icon-based navigation
- **Logout Button**:
  - Red background
  - Logout icon
  - Hover effects
- **Visual Effects**:
  - Hover effects on all buttons
  - Active scale animations
  - Shadow effects on cards
  - Toggle switch animation
  - Backdrop blur on header
  - Smooth transitions
  - Avatar edit button with border

## Design Tokens
```javascript
colors: {
  primary: "#3c83f6",
  secondary: "#64748b",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
  background-light: "#f5f7f8",
  background-dark: "#101722",
  surface-dark: "#1e293b",
  surface-highlight: "#334155",
}
font: {
  display: ["Plus Jakarta Sans", "sans-serif"],
  body: ["Plus Jakarta Sans", "sans-serif"],
}
borderRadius: { "DEFAULT": "0.5rem", "lg": "1rem", "xl": "1.5rem", "2xl": "2rem", "full": "9999px" },
```

## Component Structure
```
├── Top App Bar
│   └── Profile Title
├── Profile Header Section
│   ├── Avatar Image
│   │   └── Edit Button Overlay
│   ├── Teacher Name (Mrs. Davis)
│   ├── Teacher Badge
│   └── Email Address
├── Account Settings Group
│   ├── Edit Profile Button
│   │   ├── Icon (Person)
│   │   ├── Label + Description
│   │   └── Chevron Right
│   └── Change Password Button
│       ├── Icon (Lock)
│       ├── Label
│       └── Chevron Right
├── Preferences Group
│   ├── Notifications Button
│   │   ├── Icon (Notifications)
│   │   ├── Label
│   │   └── Chevron Right
│   └── Dark Mode Toggle
│       ├── Icon (Dark Mode)
│       ├── Label
│       └── Toggle Switch
├── Support Group
│   ├── Help Center Button
│   │   ├── Icon (Help)
│   │   ├── Label
│   │   └── Chevron Right
│   └── Report Issue Button
│       ├── Icon (Bug Report)
│       ├── Label
│       └── Chevron Right
├── Logout Button
│   ├── Logout Icon
│   └── Label
└── Version Info
```

## Usage Notes
- Avatar with edit button overlay
- Grouped settings for better organization
- Toggle switch for dark mode
- Logout button with red styling
- Hover effects on all interactive elements
- Active scale animations on press
- Icon-based navigation for visual clarity
- Version info at bottom

## Accessibility
- Keyboard navigation through all sections
- Screen reader announcements for toggle changes
- Focus indicators on all interactive elements
- ARIA labels for all buttons
- High contrast colors
- Large touch targets for motor accessibility
- Proper heading hierarchy
- Toggle switch announced to screen readers
