# Student App: Help Center

**Category**: Student App - Support  
**Purpose**: FAQ and support center with search and contact options

## Description
A mobile-first help center screen providing FAQ access, search functionality, and support contact options for students.

## Key Features
- **Search Bar**:
  - Large search input with icon
  - Placeholder text guidance
  - Focus state with primary color
- **FAQ Section**:
  - Collapsible accordion items
  - Expand/collapse animations
  - Category headers with icons
- **FAQ Items**:
  - XP points explanation
  - Offline learning availability
  - Streak freeze functionality
  - Password reset instructions
- **Support Actions**:
  - Email Support button (24h response)
  - Bug Report button
  - Contact Us section
- **Footer Links**:
  - Privacy Policy
  - Terms of Service
  - App version display
- **Navigation**:
  - Desktop sidebar navigation
  - Mobile back navigation
  - Profile stub in sidebar

## Design Tokens
```javascript
colors: {
  primary: "#0df259",
  primary-dark: "#0abf46",
  background-light: "#f5f8f6",
  background-dark: "#102216",
  surface-light: "#ffffff",
  surface-dark: "#1c3a26",
}
font: {
  display: ["Lexend", "sans-serif"]
}
borderRadius: {"DEFAULT": "1rem", "lg": "2rem", "xl": "3rem", "full": "9999px"},
boxShadow: {
  'card': '0 4px 0 0 rgba(0,0,0,0.05)',
  'card-hover': '0 8px 0 0 rgba(0,0,0,0.05)',
  'btn': '0 4px 0 0 #e5e7eb',
  'btn-active': '0 0 0 0 #e5e7eb',
}
```

## Component Structure
```
├── Desktop Side Navigation
│   ├── App Logo
│   ├── Nav Links (Learn, Practice, Leaderboard, Help Center, Profile)
│   └── User Profile Stub
├── Main Content Area
│   ├── Sticky Header
│   │   ├── Back Button
│   │   └── Page Title ("Help Center")
│   ├── Scrollable Content
│   │   ├── Hero Section
│   │   │   ├── Support Agent Icon
│   │   │   ├── Heading ("How can we help?")
│   │   │   └── Subtext
│   │   ├── Search Bar
│   │   │   ├── Search Icon
│   │   │   └── Input Field
│   │   ├── FAQ Section
│   │   │   ├── Section Header (Icon + "Frequently Asked")
│   │   │   ├── FAQ Item 1 (XP Points)
│   │   │   ├── FAQ Item 2 (Offline Learning)
│   │   │   ├── FAQ Item 3 (Streak Freeze)
│   │   │   └── FAQ Item 4 (Password Reset)
│   │   ├── Support Actions
│   │   │   ├── Section Header (Icon + "Contact Us")
│   │   │   ├── Email Support Button
│   │   │   └── Bug Report Button
│   │   └── Footer Links
│   │       ├── Privacy Policy
│   │       ├── Terms of Service
│   │       └── App Version
```

## Usage Notes
- FAQ items use HTML details/summary for native accordion
- Expand animation on FAQ items
- Search bar with focus ring
- Desktop sidebar with active state on Help Center
- Mobile back navigation
- Support buttons with icon + text
- Footer links with chevron icons

## Accessibility
- Native HTML details/summary for FAQ
- Screen reader announcements
- Keyboard navigation through FAQ
- Focus states on all interactive elements
- High contrast icons and text
- Large touch targets for mobile
