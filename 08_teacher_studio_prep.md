# 08. Teacher Studio (Prep Dashboard)

## 1. Goal
The "Studio" is a desktop-optimized environment for planning lessons on the go or at home. It follows the **"Stitch UI"** philosophy: Split-screen verification and timeline building.

## 2. Key Interface Modules

### Module A: The Source Explorer (Left Pane)
- **Gallery View:** Shows all uploaded pages for the unit.
- **Status Badges:** `✅ Processed`, `⚠️ Needs Review`, `🔄 Indexing`.
- **Interaction:** Drag a page (or a cropped section) into the timeline to force-convert it into a specific slide type.

### Module B: The Interactive Timeline (Center Pane)
- **Vertical Stack:** Shows the 6-step flow as "Lego Bricks."
- **Visual Feedback:** 
    - **Blue Bricks:** High-fidelity content (directly from book).
    - **Orange Bricks:** AI-suggested content (needs teacher approval).
    - **Red Bricks:** Broken assets or missing links.
- **Tools:** [Add Step], [Delete], [Duplicate], [Move Up/Down].

### Module C: The Asset Inspector (Right Pane)
- Opens when a Timeline Brick is clicked.
- **Functionality:**
    - **Swap Menu:** Search Web (YouTube/Unsplash) vs. AI Generate (Nano Banana).
    - **Image Editor:** Crop, rotate, or replace backgrounds.
    - **Text Editor:** Fix typos in extracted grammar/vocab.
    - **Voice Preview:** Listen to the generated character voices for the story.

---

## 3. The "Director" Experience
- **Pre-flight Check:** A "Ready to Teach" button that checks for broken links or unpublished assets.
- **Auto-Save:** Real-time persistence to Supabase.
- **Mobile Prep:** A simplified "Vertical Feed" version of the Studio for phone usage, focusing on Quick Approval and Swiping rather than complex layout editing.

---

## 4. Collaborative Features
- **Lesson Sharing:** Teachers can share their "Optimized" blueprints with other teachers in the same school.
- **Global Corrections:** A "Contribute to Brain" toggle that sends teacher-made corrections back to the central AI for better future scanning.
