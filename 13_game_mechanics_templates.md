# 13. Game Mechanics & Templates

## 1. Goal
To provide a reusable engine of game templates that can be populated with any scanned textbook content.

## 2. Classroom Games (Board Focused)

### The Wheel of Destiny (The Core)
- **Visual:** A large spinning wheel with student names/avatars.
- **Logic:** Picks the "Active Player" for the next challenge.
- **Modes:** 
    - `True Random` (anyone can be picked again).
    - `Elimination` (everyone gets exactly one turn).

### Speed Quiz (The Vocab Blaster)
- **Setup:** A word/image flashes on screen.
- **Action:** Selected student has 5 seconds to shout the word.
- **Verdict:** Teacher hits "Correct" on their phone to award points.

### Team Battle (The Grammar Grid)
- **Setup:** Tic-Tac-Toe or Hexagon grid.
- **Action:** Teams (Red vs Blue) must answer a question to place their color.
- **Win Condition:** 3 in a row or total territory.

### Magic Eyes (Memory)
- **Setup:** 4 cards shown. Screen "blinks." One disappears.
- **Action:** Student must name "What's Missing?".

---

## 3. Student Missions (Mobile Focused)

### Sentence Scramble
- **Setup:** Jumbled word bubbles: `[Is] [The] [Cat] [Under]`.
- **Action:** Drag them into the correct linear order.

### Phonics Phlyer
- **Setup:** Audio of a phoneme (e.g., "sh").
- **Action:** Tap all words that contain that sound as they fly across the screen.

### Story Dubbing (The MVP)
- **Setup:** A silent comic panel.
- **Action:** Press "Record" and read the text bubble.
- **Feedback:** AI scores pronunciation and generates a shareable video.

---

## 4. Game Engine Logic
All games are "content-agnostic." They simply consume a standard data object:
```json
{
  "template": "SPEED_QUIZ",
  "timer": 10,
  "difficulty": "hard",
  "content": [ { "id": "1", "q": "Image_URL", "a": "Banana" } ]
}
```
