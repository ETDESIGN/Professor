# 10. Classroom Board (Digital Stage)

## 1. Goal
The "Board" is the visual anchor of the lesson, displayed on a projector or smartboard. It is a "Zero UI" environment—no small menus, cursors, or buttons. Everything is large, high-contrast, and cinematic.

## 2. Core Template Library
Gemini populates these specific React templates:

### INTRO_SPLASH
- **Purpose:** Set the theme when students walk in.
- **Visuals:** Animated unit title, high-res background, "League" leaderboard preview.

### MEDIA_PLAYER
- **Purpose:** Direct consumption of videos/songs.
- **Features:** Synced karaoke lyrics, large Play/Pause indicators (even if controlled by phone).

### FOCUS_CARDS
- **Purpose:** Vocabulary introduction.
- **Animation:** 3D-flip effect. Front: Image. Back: Word + Audio playback.

### STORY_STAGE (Cinematic Comic)
- **Problem:** Full comic pages are unreadable on a board.
- **Solution:** **Cinematic Pan-and-Scan.**
- **Action:** The board zooms into individual panels based on AI-detected coordinates. Speech bubbles are rendered as high-legibility HTML overlays.

### GRAMMAR_BOARD
- **Purpose:** Abstract concept visualization.
- **Visuals:** Drag-and-drop mechanics where pieces "Snap" together (e.g., matching subjects to verbs).

### GAME_ARENA
- **Purpose:** Full-class competition.
- **Visuals:** Large Wheel of Destiny, persistent Session Scoreboard, celebratory animations (Confetti, Fire) for correct answers.

---

## 3. Communication & State
- **URL-based:** `app.englishclass.com/board/class_123`.
- **Slave Mode:** It is strictly controlled by the "Active Session" pointer in Supabase. It does not navigate itself.
- **Assets:** Pre-loads the next 2-3 slides to ensure seamless transitions without loading spinners.
