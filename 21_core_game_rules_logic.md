# 21. Core Game Rules & Logic Details

## 1. Goal
To define the specific technical logic behind the most frequent classroom and home activities.

## 2. The Wheel of Destiny Logic
- **Input:** `Array<StudentProfile>`
- **Logic:** 
  - If `ELIMINATION_MODE`: Pop student from local array until empty, then refill.
  - If `DISTRIBUTION_MODE`: Increase probability for students who haven't spoken in the current session.
- **Event:** Triggers `WHEEL_SPIN_START` and `WHEEL_LANDED` WebSocket events.

## 3. Scoring Engine
- **Classroom Point (Star):** 10 XP + 1 Coin. Awarded by teacher.
- **Winning Team Bonus:** 50 XP per student.
- **Homework Accuracy Bonus:** scaled 0-100 XP based on % correct.
- **Streak Bonus:** multiplier (e.g., 2 consecutive days = 1.1x XP).

---

## 4. Drag & Drop "Match" Logic
- **Entity Identification:** Every "Sticker" has a `TARGET_ID`.
- **Drop Zones:** Coordinates on the `INTERACTIVE_CANVAS` mapped to `TARGET_ID`.
- **Validation:** 
  - If `Sticker.id == Zone.target_id` -> Play "Snap" sound + Snap to center.
  - Else -> "Boing" sound + Bounce back to original position.

## 5. Story Dubbing Logic
- **Timing:** Every panel has a `START_TIME` and `END_TIME` relative to the movie playback.
- **Recording Mask:** System activates mic ONLY during the student's character's active segments.
- **Grading:** Uses **DTW (Dynamic Time Warping)** to compare the student's audio waveform timing and frequency with the master reference.
