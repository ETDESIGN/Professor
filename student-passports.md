# Teacher Dashboard: Student Passports

**Category**: Teacher Dashboard - Student Management  
**Purpose**: Generate and manage printable student login credentials with QR codes

## Description
A web-based dashboard screen for viewing, selecting, and generating PDF passports for students. Features grid view of student cards with QR codes, PINs, and selection controls.

## Key Features
- **Student Cards**:
  - Avatar photo with QR code icon overlay
  - Student name and ID
  - 4-digit Access PIN
  - QR code for quick login
  - Selection checkbox
  - Status indicators (connected, pending, no parent)
- **Selection System**:
  - Individual card selection
  - Select All toggle
  - Selected count display
  - Visual selection state (green border, check badge)
- **Toolbar**:
  - Search by student name
  - View toggle (grid/list)
  - Hide PINs toggle
  - Generate PDF button for selected
- **Stats Overview**:
  - Total Students count
  - Selected for Print count
  - Roster Management link
- **Navigation**:
  - Breadcrumb navigation
  - Sidebar navigation
  - Class code display
- **Visual Effects**:
  - Card hover lift effect
  - Selection border highlight
  - QR code opacity on unselected
  - Hover action buttons

## Design Tokens
```javascript
colors: {
  primary: "#0df26c",
  background-light: "#f5f8f7",
  background-dark: "#102217",
}
font: {
  display: ["Lexend", "Noto Sans", "sans-serif"],
  body: ["Noto Sans", "sans-serif"],
}
borderRadius: {"DEFAULT": "0.25rem", "lg": "0.5rem", "xl": "0.75rem", "full": "9999px"},
```

## Component Structure
```
├── Sidebar Navigation
│   ├── User Profile (Teacher)
│   ├── Nav Links (Dashboard, Classes, Resources, Reports, Settings)
│   └── Sign Out Button
├── Main Content Area
│   ├── Top Header
│   │   ├── Breadcrumbs (Classes > Class 3B > Passports)
│   │   ├── Page Title ("Student Passports")
│   │   ├── Description
│   │   └── Class Code Display
│   ├── Scrollable Content
│   │   ├── Stats Row
│   │   │   ├── Total Students Card
│   │   │   ├── Selected for Print Card (Highlighted)
│   │   │   └── Info Card (Roster Management Link)
│   │   ├── Toolbar
│   │   │   ├── Search Input
│   │   │   ├── Select All Checkbox
│   │   │   ├── View Toggle (Grid/List)
│   │   │   ├── Hide PINs Toggle
│   │   │   └── Generate PDF Button
│   │   └── Passports Grid
│   │       ├── Student Card 1 (Selected)
│   │       │   ├── Check Badge
│   │       │   ├── Avatar + QR Icon
│   │       │   ├── Student Name + ID
│   │       │   └── PIN + QR Code
│   │       ├── Student Card 2 (Unselected)
│   │       ├── Student Card 3 (Selected)
│   │       ├── Student Card 4 (Unselected)
│   │       ├── Student Card 5 (Selected)
│   │       └── Student Card 6 (Selected)
```

## Usage Notes
- Cards display in responsive grid (1-4 columns)
- Selected cards have green border and check badge
- QR codes shown with 80% opacity on unselected
- PINs displayed in large monospace font
- Generate PDF button shows selected count
- Hide PINs toggle for privacy
- Search filters by name in real-time

## Accessibility
- High contrast selection states
- Screen reader announcements for selection
- Keyboard navigation through grid
- Focus states on all interactive elements
- Large touch targets for selection
- Alt text for avatars and QR codes
