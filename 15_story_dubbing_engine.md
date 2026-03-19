# 15. Story & Dubbing Engine

## 1. Goal
To transform static textbook comic strips into a "Living Cinema" experience where students can participate in the narrative.

## 2. The Board Experience: "Cinematic Mode"
1. **The Page Scan:** Gemini identifies the coordinates of every comic panel on the page.
2. **The Zoom:** The Board focuses on Panel 1. It crops the image to fill the screen.
3. **The Bubble:** The AI-extracted text is rendered as an overlay bubble to ensure perfect legibility.
4. **The Interaction:** 
    - **Tap:** Plays the character's audio.
    - **Toggle "Mute":** Allows the class to perform the lines (Karaoke style).
    - **Next:** Pans smoothly to Panel 2.

---

## 3. The Home Experience: "Dubbing Missions"
This is the app's "Viral Feature" for student motivation and parent pride.

### The Workflow:
1. **Preview:** The student watches the comic strip play as a 30-second silent "Movie."
2. **Record:** The student picks a character (e.g., "Rocky the Robot").
3. **Performance:** The "Movie" plays again. When Rocky's bubble highlights, the student speaks into the phone.
4. **Synthesis:** The app merges the recorded audio with the comic visuals.
5. **Output:** A shareable video file (`.mp4`) is generated.

---

## 4. Technical Requirements
- **Audio Merging:** Client-side (or Edge Function) merging of audio tracks.
- **Voice Analysis:** Gemini compares the waveform of the student's recording with the teacher-approved reference audio.
- **Rendering:** Responsive HTML5 Canvas or SVG-based animation for the "Living Comic" transitions.
