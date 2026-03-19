# Teacher Dashboard: Live Remote (Projector Control)

**Category**: Teacher Dashboard - Mobile App  
**Purpose**: Live classroom control panel for managing projector and classroom activities

## Description
A mobile companion app for teachers to control the classroom board, manage current content, and access "God Mode" tools during live sessions.

## Key Features
- **Header**:
  - Room info with live connection status
  - WiFi indicator with animated pulse
  - "Live Connection" status text
  - Disconnect button
- **Now Playing Monitor Card**:
  - Large content preview (showing "Elephant")
  - Content type indicator (Image Slide)
  - "Up Next" strip showing next item (Tiger)
  - Skip next button
  - Background accent decoration
- **Central Navigation Pad**:
  - Previous button (left)
  - Reveal button (center, large)
  - Next button (right)
  - Active scale effects on press
  - Border animations on active state
- **God Mode Tools Grid**:
  - Voice Command button
  - Spin Wheel button
  - Give Points button
  - Quiet Mode button
  - Hover effects with gradient decorations
  - Color-coded icons (blue, yellow, green, rose)
- **Bottom Navigation Bar**:
  - Class tab (active)
  - Students tab
  - Settings tab
  - Backdrop blur effect
- **Visual Effects**:
  - Gradient decorations on hover
  - Shadow effects on cards
  - Active scale animations
  - Backdrop blur on navigation
  - Pulse animation on connection indicator

## Design Tokens
```javascript
colors: {
  primary: "#3B82F6",
  secondary: "#6366f1",
  success: "#10B981",
  warning: "#F59E0B",
  background-light: "#F3F4F6",
  background-dark: "#0F172A",
  surface-dark: "#1E293B",
  surface-dark-highlight: "#334155",
}
font: {
  display: ["Plus Jakarta Sans", "sans-serif"]
}
borderRadius: {
  "DEFAULT": "0.5rem",
  "lg": "1rem",
  "xl": "1.5rem",
  "2xl": "2rem",
  "3xl": "3rem",
  "full": "9999px"
}
```

## Component Structure
```
├── Header
│   ├── Room Info (Room 304)
│   ├── Connection Status (WiFi + Live Connection)
│   └── Disconnect Button
├── Main Content Area
│   ├── Now Playing Monitor Card
│   │   ├── Content Preview (Elephant)
│   │   ├── Content Type Badge (Image Slide)
│   │   └── Up Next Strip (Tiger + Skip)
│   ├── Central Navigation Pad
│   │   ├── Previous Button
│   │   ├── Reveal Button (Large)
│   │   └── Next Button
│   └── God Mode Tools Grid
│       ├── Voice Command
│       ├── Spin Wheel
│       ├── Give Points
│       └── Quiet Mode
└── Bottom Navigation Bar
    ├── Class Tab (Active)
    ├── Students Tab
    └── Settings Tab
```

## Usage Notes
- Large touch targets for classroom use
- Swipe controls enabled
- Reveal button for showing content
- God Mode tools for quick actions
- Live connection indicator with pulse
- Up Next strip for previewing next item
- Disconnect button to end session
- Color-coded tool buttons for quick identification

## Accessibility
- Keyboard navigation through controls
- Screen reader announcements for content changes
- Focus indicators on all interactive elements
- ARIA labels for all buttons
- High contrast colors
- Large touch targets for motor accessibility
- Proper heading hierarchy
- Connection status announced to screen readers
