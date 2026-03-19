# Student App: Login

**Category**: Student App - Authentication  
**Purpose**: Class code entry screen for students to join their teacher's class

## Description
A mobile-first login screen where students enter their class code to access lessons. Features hero illustration, progress indicator, and helpful hints.

## Key Features
- **Hero Illustration**: Large 3D robot mascot character
- **Class Code Input**: 
  - Uppercase, tracking-widest text
  - School icon prefix
  - Success indicator
- **Progress Indicator**: Step 1 of 3 with visual bar
- **Helpful Hint**: Info card explaining class code format (e.g., ABC-123)
- **Navigation**: Back button and help link
- **Action Button**: Large "Next" button with arrow icon

## Design Tokens
```javascript
colors: {
  primary: "#0dccf2",
  background-light: "#f5f8f8",
  background-dark: "#101f22",
  surface-dark: "#1b2527"
}
font: {
  display: ["Lexend", "sans-serif"]
}
borderRadius: {
  xl: "0.75rem",
  2xl: "1rem",
  3xl: "1.5rem",
  full: "9999px"
}
```

## Component Structure
```
├── Status Bar (Decorative)
│   ├── Time Display
│   └── Signal Indicators
├── Header
│   ├── Back Button
│   ├── Step Indicator (1 of 3)
│   └── Progress Bar
├── Main Content
│   ├── Hero Illustration (Robot Mascot)
│   ├── Heading ("Let's learn English!")
│   ├── Description
│   └── Input Form
│       ├── Class Code Label
│       ├── Input Field (with Icon)
│       └── Hint Card (with Lightbulb)
└── Action Area
    ├── Next Button
    └── Help Link
```

## Usage Notes
- Input uses uppercase tracking-widest for code format
- Success indicator hidden by default, shown on validation
- Mobile viewport simulation (max-width 400px, height 850px)
- Decorative status bar for mobile realism

## Accessibility
- Large input field (h-16) for easy tapping
- Clear focus states with ring effect
- Screen reader announcements for validation
- High contrast text on dark background
