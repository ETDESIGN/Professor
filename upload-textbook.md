# Teacher Dashboard: Upload Textbook

**Category**: Teacher Dashboard - Content Input  
**Purpose**: Scan and digitize textbook pages for lesson creation

## Description
A web-based screen where teachers upload textbook images or PDFs to be processed by AI. Features drag-and-drop upload zone, tips for best results, and recent scans history.

## Key Features
- **Upload Zone**: Large drag-and-drop area with dashed border
  - File type badges (JPG, PNG, PDF)
  - Hover effects with primary color
  - Cloud upload icon
- **Progress Indicator**: Step indicator (Step 1 of 3)
  - Next step hint ("Next: Review Content")
- **Action Button**: "Start AI Scan" with prominent styling
- **Tips Panel**: 
  - Good lighting tip
  - Flat surface tip
  - Avoid blurry text warning
- **Recent Scans**: Quick access to previously uploaded pages
  - Thumbnail previews
  - Timestamps

## Design Tokens
```javascript
colors: {
  primary: "#0df259",
  primary-hover: "#0be050",
  background-light: "#f5f8f6",
  background-dark: "#102216",
  surface-light: "#ffffff",
  surface-dark: "#1a2e22"
}
font: {
  display: ["Lexend", "sans-serif"],
  body: ["Noto Sans", "sans-serif"]
}
borderRadius: {
  xl: "2rem"
}
```

## Component Structure
```
├── Sidebar Navigation
│   ├── Brand (Icon + Title)
│   ├── Nav Items
│   │   ├── Classes
│   │   ├── New Lesson (Active)
│   │   └── Library
│   └── User Profile
└── Main Content Area
    ├── Progress Indicator
    │   ├── Step Label
    │   └── Progress Bar
    ├── Page Heading
    │   ├── Title ("Let's digitize your textbook")
    │   └── Description
    ├── Upload Zone (2/3 width)
    │   ├── Drag & Drop Content
    │   ├── File Type Badges
    │   └── Hidden File Input
    ├── Action Bar
    │   ├── Info Tip (Max file size)
    │   └── Start AI Scan Button
    └── Sidebar Helper (1/3 width)
        ├── Tips Card
        │   ├── Good Lighting
        │   ├── Flat Surface
        │   └── Avoid Blurry Text
        └── Recent Scans
            └── Scan Items (Thumbnail + Info)
```

## Usage Notes
- Upload zone uses min-height 400px for visibility
- Recent scans show thumbnails with timestamps
- Action button has prominent shadow and hover effects
- Tips use checkmark icons for positive, cancel for negative

## Accessibility
- Large drop zone for easy targeting
- Screen reader announcements for upload status
- Focus states on all interactive elements
- High contrast text on all backgrounds
