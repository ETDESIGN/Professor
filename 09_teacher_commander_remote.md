# 09. Teacher Commander (Live Remote)

## 1. Goal
The "Commander" is a mobile-first PWA interface that turns the teacher's phone or tablet into a wireless remote control for the Big Board. This allows the teacher to move around the classroom while maintaining total control.

## 2. Key Interface Modes

### Mode A: Presentation Control
- **Gesture Areas:** Large touch zones for navigation.
    - **Swipe Left/Right:** Previous/Next slide.
    - **Double Tap:** Trigger "Reveal" (e.g., flip a flashcard).
    - **Long Press:** Highlight a specific area on the Big Board.
- **Presenter Notes:** Scrollable text only visible on the phone for "Teacher Talking Points."

### Mode B: The "God Mode" Tools
- **Wheel Trigger:** A giant central button to spin the "Wheel of Destiny."
- **Point Pad:** A quick-access list of students/teams.
    - Tap "Leo" -> Tap "+10 Stars".
    - Multi-select capability for team bonuses.
- **Attention Signal:** A one-touch button to dim the Big Board and play a "Quiet" chime.

### Mode C: Input Tools
- **Microphone:** Use the phone's mic to record "Teacher Examples" that play instantly on the Big Board speakers.
- **Live Snap:** Take a photo of a student's book or a real-world object. It appears on the Big Board in <2 seconds for "Show & Tell."

---

## 3. Real-time Architecture
- **WebSockets:** Uses Supabase Realtime to broadcast events.
- **State Sync:** The phone knows exactly which slide index the Board is on.
- **Emergency Button:** A "Skip Step" function to jump over broken videos or tasks that are losing class interest.

---

## 4. UI/UX Features
- **High Contrast:** Designed for visibility in brightly lit or dimly lit classrooms.
- **Big Buttons:** Minimized risk of "Fat Finger" errors during active teaching.
- **One-Handed Use:** Optimized for reaching primary controls with the thumb while holding a tablet or phone.
