# ESL Educational App - UI Component Library

A comprehensive library of UI components for an ESL (English as a Second Language) educational platform with four main applications: Classroom Board, Student App, Teacher Dashboard, and Parent App.

## 📁 Structure

```
ui-components/
├── README.md (This file)
│
├── classroom-board/          # Classroom projection screens (16 components)
│   ├── i-say-you-say.md
│   ├── magic-eyes.md
│   ├── story-sequencing.md
│   ├── unscramble.md
│   ├── whats-missing.md
│   ├── speed-quiz.md
│   ├── team-battle.md
│   ├── live-class-warmup.md
│   ├── wheel-of-destiny.md
│   ├── unit-selection.md
│   ├── layout.md
│   ├── media-player.md
│   ├── focus-cards.md
│   ├── story-stage.md
│   ├── grammar-sandbox.md
│   └── game-arena.md
│
├── student-app/              # Mobile student application (9 components)
│   ├── login.md
│   ├── home-map.md
│   ├── pronunciation-coach.md
│   ├── listen-tap.md
│   ├── dubbing-studio.md
│   ├── help-center.md
│   ├── profile.md
│   ├── sentence-scramble.md
│   └── settings.md
│
├── teacher-dashboard/         # Web teacher portal (17 components)
│   ├── unit-list.md
│   ├── upload-textbook.md
│   ├── ai-analysis.md
│   ├── review-content.md
│   ├── student-passports.md
│   ├── ai-asset-enrichment.md
│   ├── lesson-timeline-builder.md
│   ├── lesson-studio.md
│   ├── live-commander.md
│   ├── class-management.md
│   ├── mobile-layout.md
│   ├── live-remote.md
│   ├── student-selector-modal.md
│   ├── lesson-editor.md
│   ├── profile-settings.md
│   └── account-settings.md
│
└── parent-app/              # Mobile parent application (2 components)
    ├── dashboard.md
    └── dubbing-gallery.md
```

## 🎨 Design System

### Color Palette

#### Classroom Board (Primary: Duo Green)
```javascript
{
  primary: "#58cc02",
  primary-dark: "#46a302",
  secondary: "#ffc800",
  secondary-dark: "#e5b400",
  background-light: "#ffffff",
  background-dark: "#131f24",
  surface-dark: "#131f24",
  blue-highlight: "#1cb0f6",
  blue-dark: "#1899d6",
  pink-highlight: "#ff4b4b",
  purple-highlight: "#ce82ff"
}
```

#### Student App (Primary: Duo Green)
```javascript
{
  primary: "#58cc02",
  primary-dark: "#46a302",
  secondary: "#ffc800",
  secondary-dark: "#e5b400",
  background-light: "#ffffff",
  background-dark: "#131f24",
  surface-dark: "#131f24",
  surface-locked: "#e5e5e5",
  locked-text: "#afafaf",
  path-line: "#e5e5e5",
  blue-highlight: "#1cb0f6",
  blue-dark: "#1899d6",
  pink-highlight: "#ff4b4b",
  purple-highlight: "#ce82ff"
}
```

#### Teacher Dashboard (Primary: Green)
```javascript
{
  primary: "#0df26c",
  background-light: "#f5f8f7",
  background-dark: "#102217",
  surface-light: "#ffffff",
  surface-dark: "#1a2e22",
  "ai-accent": "#6366f1" // Indigo for AI
}
```

#### Parent App (Primary: Cyan)
```javascript
{
  primary: "#0dccf2",
  background-light: "#f5f8f8",
  background-dark: "#111718",
  surface-dark: "#1b2527",
  surface-highlight: "#283639"
}
```

### Typography

```javascript
{
  display: ["Lexend", "sans-serif"],
  body: ["Noto Sans", "sans-serif"]
}
```

- **Lexend**: Display font for headings and UI elements
- **Noto Sans**: Body font for readable text content

### Border Radius

```javascript
{
  "DEFAULT": "1rem",
  "lg": "1.5rem",
  "xl": "2rem",
  "2xl": "2.5rem",
  "full": "9999px"
}
```

### Box Shadows

```javascript
{
  'btn': '0px 4px 0px 0px rgba(0,0,0,0.2)',
  'btn-primary': '0px 4px 0px 0px #46a302',
  'btn-secondary': '0px 4px 0px 0px #e5b400',
  'btn-blue': '0px 4px 0px 0px #1899d6',
  'btn-locked': '0px 4px 0px 0px #cecece',
  'card': '0px 2px 0px 0px #e5e5e5',
  'nav': '0px -2px 0px 0px #e5e5e5'
}
```

## 📱 Component Categories

### Classroom Board (16 screens)
Interactive projection screens for live classroom sessions:

| Component | Purpose |
|-----------|---------|
| [`i-say-you-say.md`](classroom-board/i-say-you-say.md) | Repetition practice with word display |
| [`magic-eyes.md`](classroom-board/magic-eyes.md) | Memory game with image reveal |
| [`story-sequencing.md`](classroom-board/story-sequencing.md) | Story ordering activity |
| [`unscramble.md`](classroom-board/unscramble.md) | Word unscramble game |
| [`whats-missing.md`](classroom-board/whats-missing.md) | Visual memory game |
| [`speed-quiz.md`](classroom-board/speed-quiz.md) | Fast-paced quiz competition |
| [`team-battle.md`](classroom-board/team-battle.md) | Team-based competitive game |
| [`live-class-warmup.md`](classroom-board/live-class-warmup.md) | Class warm-up activities |
| [`wheel-of-destiny.md`](classroom-board/wheel-of-destiny.md) | Random selector wheel |
| [`unit-selection.md`](classroom-board/unit-selection.md) | Unit/lesson selection screen |
| [`layout.md`](classroom-board/layout.md) | Main dashboard with timer, focus card, and quick tools |
| [`media-player.md`](classroom-board/media-player.md) | Full-screen video player with karaoke lyrics overlay |
| [`focus-cards.md`](classroom-board/focus-cards.md) | Interactive flashcard system with 3D flip animations |
| [`story-stage.md`](classroom-board/story-stage.md) | Comic-style story viewer with dialogue bubbles |
| [`grammar-sandbox.md`](classroom-board/grammar-sandbox.md) | Drag-and-drop word matching game for nouns and verbs |
| [`game-arena.md`](classroom-board/game-arena.md) | Team competition game with spin wheel and winner modal |

### Student App (9 screens)
Mobile-first learning application for students:

| Component | Purpose |
|-----------|---------|
| [`login.md`](student-app/login.md) | Student authentication |
| [`home-map.md`](student-app/home-map.md) | Gamified progress path with levels |
| [`pronunciation-coach.md`](student-app/pronunciation-coach.md) | Audio recording and feedback |
| [`listen-tap.md`](student-app/listen-tap.md) | Listening comprehension game |
| [`dubbing-studio.md`](student-app/dubbing-studio.md) | Video dubbing creation |
| [`help-center.md`](student-app/help-center.md) | FAQ and support center |
| [`profile.md`](student-app/profile.md) | Student profile and stats |
| [`sentence-scramble.md`](student-app/sentence-scramble.md) | Grammar word ordering game |
| [`settings.md`](student-app/settings.md) | App preferences and account |

### Teacher Dashboard (17 screens)
Web-based content management and classroom tools:

| Component | Purpose |
|-----------|---------|
| [`unit-list.md`](teacher-dashboard/unit-list.md) | Browse and manage curriculum units |
| [`upload-textbook.md`](teacher-dashboard/upload-textbook.md) | Upload and process textbooks |
| [`ai-analysis.md`](teacher-dashboard/ai-analysis.md) | View AI content processing status |
| [`review-content.md`](teacher-dashboard/review-content.md) | Review AI-generated lesson content |
| [`student-passports.md`](teacher-dashboard/student-passports.md) | Generate login credentials with QR codes |
| [`ai-asset-enrichment.md`](teacher-dashboard/ai-asset-enrichment.md) | Approve AI-generated vocabulary and media |
| [`lesson-timeline-builder.md`](teacher-dashboard/lesson-timeline-builder.md) | Drag-and-drop lesson planning |
| [`lesson-studio.md`](teacher-dashboard/lesson-studio.md) | Three-panel lesson creation workspace |
| [`live-commander.md`](teacher-dashboard/live-commander.md) | Live classroom control panel |
| [`class-management.md`](teacher-dashboard/class-management.md) | Student roster and parent connections |
| [`mobile-layout.md`](teacher-dashboard/mobile-layout.md) | Main mobile app layout with top bar, content area, and bottom navigation |
| [`live-remote.md`](teacher-dashboard/live-remote.md) | Live classroom control panel for managing projector and classroom activities |
| [`student-selector-modal.md`](teacher-dashboard/student-selector-modal.md) | Modal for selecting students to award points during live classroom sessions |
| [`lesson-editor.md`](teacher-dashboard/lesson-editor.md) | Timeline-based lesson editor for planning and organizing lesson content |
| [`profile-settings.md`](teacher-dashboard/profile-settings.md) | Main profile settings screen with account, preferences, and support options |
| [`account-settings.md`](teacher-dashboard/account-settings.md) | Sub-screen for editing account details and managing security settings |

### Parent App (2 screens)
Mobile monitoring and engagement app for parents:

| Component | Purpose |
|-----------|---------|
| [`dashboard.md`](parent-app/dashboard.md) | Child progress overview and stats |
| [`dubbing-gallery.md`](parent-app/dubbing-gallery.md) | View child's video creations |

## 🚀 Usage Guidelines

### For AI Coding Assistants

1. **Load Relevant Files**: Only load component files you're working on
2. **Reference Design Tokens**: Use color palette and typography from this README
3. **Follow Component Structure**: Each file documents exact structure and features
4. **Maintain Consistency**: Use same design tokens across all components

### Component File Format

Each component file includes:

- **Purpose**: What the screen/component does
- **Key Features**: Main interactive elements and functionality
- **Design Tokens**: Specific colors, fonts, and styling
- **Component Structure**: Hierarchy and layout
- **Usage Notes**: Implementation details and behaviors
- **Accessibility**: ARIA labels, keyboard navigation, screen reader support

### Design Principles

1. **Gamification**: Progress tracking, streaks, XP, levels, rewards
2. **Mobile-First**: Student and Parent apps designed for mobile
3. **Dark Mode Support**: All components support light/dark themes
4. **Accessibility**: WCAG AA compliance with keyboard navigation and screen readers
5. **Visual Hierarchy**: Clear information architecture with proper contrast

## 📊 Component Statistics

- **Total Components**: 44 screens
- **Classroom Board**: 16 screens
- **Student App**: 9 screens
- **Teacher Dashboard**: 17 screens
- **Parent App**: 2 screens

## 🎯 Key Features Across Platform

### Gamification Elements
- XP points and levels
- Streak counters
- Achievement badges
- Leaderboards
- Progress maps with unlockable content

### AI Integration
- Auto-generated vocabulary
- Image generation for words
- TTS pronunciation audio
- Content analysis from textbooks
- Smart lesson suggestions

### Engagement Features
- Video dubbing studio
- Team competitions
- Interactive games
- Progress sharing
- Parent-child connection

## 🔧 Development Notes

### Tech Stack
- **Styling**: Tailwind CSS
- **Icons**: Material Symbols Outlined
- **Fonts**: Google Fonts (Lexend, Noto Sans)
- **Framework**: Responsive design approach

### File Organization
- Each component in its own `.md` file
- Logical folder structure by app
- Comprehensive README for reference
- Design tokens documented per component

### Best Practices
1. Use semantic HTML elements
2. Implement proper ARIA labels
3. Ensure keyboard navigation
4. Test with screen readers
5. Maintain consistent spacing and sizing
6. Use appropriate color contrast ratios
7. Implement loading states
8. Handle error states gracefully

## 📝 Maintenance

When adding new components:
1. Create appropriate `.md` file in correct folder
2. Document all features and design tokens
3. Update this README with component details
4. Follow established file structure
5. Include accessibility considerations
6. Add usage examples if applicable

## 🎨 Color Usage Guide

### Primary Colors by App
- **Classroom Board**: `#58cc02` (Duo Green)
- **Student App**: `#58cc02` (Duo Green)
- **Teacher Dashboard**: `#0df26c` (Green)
- **Parent App**: `#0dccf2` (Cyan)

### Status Colors
- **Success**: Green shades
- **Warning**: Yellow/Orange shades
- **Error**: Red/Pink shades
- **Info**: Blue shades
- **AI/Smart**: Indigo/Purple shades

### Neutral Colors
- **Backgrounds**: White to dark gray scale
- **Borders**: Light gray for separation
- **Text**: Dark gray for readability
- **Disabled**: Muted gray tones

---

**Last Updated**: January 2026
**Total Components**: 44 screens across 4 applications
