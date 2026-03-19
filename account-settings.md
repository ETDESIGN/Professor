# Teacher Dashboard: Account Settings

**Category**: Teacher Dashboard - Mobile App  
**Purpose**: Sub-screen for editing account details and managing security settings

## Description
A mobile account settings screen featuring a profile photo editor, form inputs for name and email, security options, and a danger zone for account deletion.

## Key Features
- **Top App Bar**:
  - Back button
  - Account Settings title
  - Save button
  - Backdrop blur effect
- **Profile Header Section**:
  - Large avatar image with edit button overlay
  - Teacher name (Mrs. Davis)
  - "Edit Profile Photo" button
  - Border on avatar
- **Inputs Section**:
  - Full Name input field
  - Email Address input field with verified badge
  - Form validation styling
  - Focus ring effects
- **Security & Privacy Section**:
  - Change Password button
  - Linked Accounts button
  - Icon-based navigation
  - Hover effects
- **Danger Zone**:
  - Delete Account button
  - Red background styling
  - Warning text below
  - Hover effects
- **Visual Effects**:
  - Hover effects on all buttons
  - Active scale animations
  - Shadow effects on cards
  - Focus ring on inputs
  - Backdrop blur on header
  - Smooth transitions
  - Verified badge on email

## Design Tokens
```javascript
colors: {
  primary: "#3c83f6",
  background-light: "#f5f7f8",
  background-dark: "#101722",
  surface-dark: "#223149",
  text-secondary-dark: "#90a7cb",
}
font: {
  display: ["Plus Jakarta Sans", "sans-serif"],
  body: ["Plus Jakarta Sans", "sans-serif"],
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
│   ├── Back Button
│   ├── Account Settings Title
│   └── Save Button
├── Profile Header Section
│   ├── Avatar Image
│   │   └── Edit Button Overlay
│   ├── Teacher Name
│   └── Edit Profile Photo Button
├── Inputs Section
│   ├── Full Name Input
│   └── Email Address Input
│       └── Verified Badge
├── Security & Privacy Section
│   ├── Change Password Button
│   │   ├── Icon (Lock Reset)
│   │   ├── Label
│   │   └── Chevron Right
│   └── Linked Accounts Button
│       ├── Icon (Link)
│       ├── Label
│       └── Chevron Right
└── Danger Zone
    ├── Delete Account Button
    │   ├── Delete Icon
    │   └── Label
    └── Warning Text
```

## Usage Notes
- Edit profile photo with camera button overlay
- Form inputs with focus ring effects
- Verified badge on email address
- Change password for security
- Linked accounts for external connections
- Delete account in danger zone with warning
- Save button to commit changes
- Back button to return to profile

## Accessibility
- Keyboard navigation through form
- Screen reader announcements for form validation
- Focus indicators on all interactive elements
- ARIA labels for all inputs and buttons
- High contrast colors
- Large touch targets for motor accessibility
- Proper heading hierarchy
- Form validation announced to screen readers
- Verified badge announced to screen readers
