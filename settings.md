# Student App: Settings

**Category**: Student App - App Preferences  
**Purpose**: Configure app settings, account options, and preferences

## Description
A mobile-first settings screen with toggle switches, action buttons, and account management options for students.

## Key Features
- **Profile Section**:
  - Editable avatar with edit button
  - Student name display
  - Level badge and streak counter
- **Settings Groups**:
  - Audio Preferences (Sound Effects, Speaking Exercises)
  - Account (Change PIN, Parent Dashboard)
  - Notifications (Daily Reminder with time)
- **Toggle Switches**:
  - iOS-style toggle design
  - Checked/unchecked states
  - Label with description
- **Action Buttons**:
  - Change PIN
  - Parent Dashboard link
  - Daily reminder time display
- **Destructive Actions**:
  - Sign Out button
  - App version display
- **Navigation**:
  - Back navigation
  - Bottom navigation (Home, Learn, Leaderboard, Settings)
- **Visual Effects**:
  - Toggle animation
  - Button hover effects
  - Card grouping with borders
  - Active state highlighting

## Design Tokens
```javascript
colors: {
  primary: "#0df26c",
  primary-dark: "#0bb852",
  background-light: "#f5f8f7",
  background-dark: "#102217",
  surface-light: "#ffffff",
  surface-dark: "#1c2e24",
  text-main: "#111814",
  text-sub: "#608a72",
  danger: "#ff4b4b",
  danger-bg: "#ffe5e5",
}
font: {
  display: ["Lexend", "sans-serif"],
  body: ["Lexend", "sans-serif"],
}
borderRadius: {
  "DEFAULT": "1rem", 
  "lg": "1.5rem", 
  "xl": "2rem", 
  "2xl": "2.5rem",
  "full": "9999px"
},
```

## Component Structure
```
├── Sticky Header
│   ├── Back Button
│   ├── Page Title ("Settings")
│   └── Spacer (Alignment)
├── Main Scrollable Content
│   ├── Profile Section
│   │   ├── Avatar Container
│   │   │   ├── Avatar Image
│   │   │   └── Edit Button Overlay
│   │   └── Student Info
│   │       ├── Student Name
│   │       ├── Level Badge
│   │       └── Streak Counter
│   ├── Settings Group: Audio
│   │   ├── Group Header ("Audio Preferences")
│   │   ├── Toggle Item 1 (Sound Effects)
│   │   │   ├── Icon (Volume Up)
│   │   │   ├── Label ("Sound Effects")
│   │   │   └── Toggle Switch (Checked)
│   │   └── Toggle Item 2 (Speaking Exercises)
│   │       ├── Icon (Record Voice Over)
│   │       ├── Label ("Speaking Exercises")
│   │       └── Toggle Switch (Checked)
│   ├── Settings Group: Account
│   │   ├── Group Header ("Account")
│   │   ├── Action Item 1 (Change PIN)
│   │   │   ├── Icon (Lock)
│   │   │   ├── Label ("Change PIN")
│   │   │   └── Chevron Right
│   │   └── Action Item 2 (Parent Dashboard)
│   │       ├── Icon (Family Star)
│   │       ├── Label ("Parent Dashboard")
│   │       └── Open In New Icon
│   ├── Settings Group: Notifications
│   │   ├── Group Header ("Notifications")
│   │   └── Toggle Item (Daily Reminder)
│   │       ├── Icon (Notifications Active)
│   │       ├── Label ("Daily Reminder")
│   │       ├── Time Display ("18:00 PM")
│   │       └── Toggle Switch (Checked)
│   ├── Destructive Actions
│   │   ├── Sign Out Button (Uppercase, Large)
│   │   └── App Version ("Student App v1.2.0")
└── Bottom Navigation Bar
    ├── Home
    ├── Learn
    ├── Leaderboard
    └── Settings (Active, Blue Border)
```

## Usage Notes
- Toggle switches use iOS-style design
- Settings groups separated by borders
- Action items have chevron right icons
- Sign Out button uses uppercase and large text
- App version displayed at bottom
- Bottom navigation with Settings tab highlighted
- Avatar edit button overlay on bottom-right

## Accessibility
- High contrast toggle states
- Screen reader announcements for toggle changes
- Keyboard navigation through settings
- Focus states on all interactive elements
- Large touch targets for mobile
- Proper ARIA labels for toggles
