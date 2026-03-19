# Teacher Dashboard: Class Management

**Category**: Teacher Dashboard - Student Roster  
**Purpose**: Manage student roster, parent connections, and generate login credentials

## Description
A web-based class management screen with student table, parent connection tracking, and bulk actions for roster management.

## Key Features
- **Student Table**:
  - Avatar, name, and level display
  - Student ID column
  - Status indicators (Connected, Pending, No Parent)
  - Selection checkboxes
  - Action menu (three dots)
- **Detail Sidebar**:
  - Selected student profile
  - XP, Level, and Streak stats
  - Parent connection link with copy button
  - Student passport generation
  - Bulk action hints
- **Toolbar**:
  - Search by student name
  - View toggle (grid/list)
  - Print Passports button
  - Import CSV button
- **Stats Overview**:
  - Total Students count
  - Active Parents count
  - Average XP Level
- **Navigation**:
  - Breadcrumb navigation
  - Sidebar navigation
  - Class selector dropdown
- **Visual Effects**:
  - Table row hover highlighting
  - Selected row left border
  - Card hover lift effects
  - Status badge color coding

## Design Tokens
```javascript
colors: {
  primary: "#0dccf2",
  background-light: "#f5f8f8",
  background-dark: "#101f22",
}
font: {
  display: ["Lexend", "sans-serif"]
}
borderRadius: {"DEFAULT": "0.25rem", "lg": "0.5rem", "xl": "0.75rem", "full": "9999px"},
```

## Component Structure
```
├── Sidebar Navigation
│   ├── App Logo + Title
│   ├── School Info
│   ├── Nav Links (Dashboard, Class Management, Assignments, Library, Leaderboards)
│   └── Sign Out
├── Main Content Area
│   ├── Top Header
│   │   ├── Mobile Menu Button
│   │   ├── Class Selector Breadcrumb
│   │   ├── Notification Bell (Badge)
│   │   └── Teacher Profile
│   ├── Dashboard Content
│   │   ├── Page Heading & Actions
│   │   │   ├── Title ("Class Management")
│   │   │   ├── Description
│   │   │   ├── Import CSV Button
│   │   │   └── Add Student Button
│   │   ├── Stats Overview Row
│   │   │   ├── Total Students Card
│   │   │   ├── Active Parents Card
│   │   │   └── Avg. XP Level Card
│   │   └── Main Workspace (Table + Detail Panel)
│   │       ├── Left: Roster List (Table)
│   │       │   ├── Toolbar
│   │       │   │   ├── Search Input
│   │       │   │   ├── View Toggle (Grid/List)
│   │       │   │   ├── Print Passports Button
│   │       │   │   └── Select All Checkbox
│   │       │   └── Table
│   │       │       ├── Table Header (Checkbox, Student, ID, Status, Actions)
│   │       │       ├── Row 1 (Active)
│   │       │       │   ├── Checkbox
│   │       │       │   ├── Avatar + Name + Level
│   │       │       │   ├── ID
│   │       │       │   ├── Status Badge (Connected)
│   │       │       │   └── Action Menu
│   │       │       ├── Row 2 (Selected)
│   │       │       ├── Row 3 (Active)
│   │       │       ├── Row 4 (No Parent)
│   │       │       └── Pagination
│   │       └── Right: Action Sidebar
│   │           ├── Selected Student Card
│   │           │   ├── Avatar + Level Badge
│   │           │   ├── Name + ID
│   │           │   ├── Stats Row (XP, Level, Streak)
│   │           │   └── Close Button
│   │           ├── Parent Connection
│   │           │   ├── Link Label
│   │           │   ├── Connection Input + Copy Button
│   │           │   └── Status Message
│   │           ├── Student Passport Card
│   │           │   ├── Icon + Title
│   │           │   ├── Description
│   │           │   └── Download PDF Button
│   │           └── Action Buttons
│   │               ├── View Full Profile
│   │               └── Remove Student
│   │           └── Bulk Actions Hints
│   │               ├── Email Parents Button
│   │               └── Print Certificates Button
```

## Usage Notes
- Table uses sticky header for scrolling
- Selected row has left border highlight
- Status badges color-coded (green=connected, yellow=pending, gray=no parent)
- Detail sidebar shows selected student info
- Parent link has copy-to-clipboard
- Passport generation shows download button
- Bulk actions available for multiple selections
- Pagination at bottom of table

## Accessibility
- High contrast status badges
- Screen reader announcements for selection
- Keyboard navigation through table
- Focus states on all interactive elements
- Large touch targets for actions
- Alt text for avatars
