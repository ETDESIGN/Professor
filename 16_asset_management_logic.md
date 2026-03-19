# 16. Asset Management (Search vs. Gen)

## 1. Goal
To maximize cost-efficiency while ensuring 100% content coverage for every scanned lesson.

## 2. The Multi-Tier Sourcing Logic

### Tier 1: Local / Extracted (Free)
- **OCR Text:** Straight from the textbook scan.
- **Original Illustration:** Snippets cropped from the scan by Gemini.
- **Teacher Library:** Reusable assets from previous scans (stored in `assets` table).

### Tier 2: Public API Search (Free/Low-Cost)
- **Unsplash/Pexels API:** High-quality, license-free photos for vocab.
- **YouTube Data API:** Finding educational songs or cultural context clips.
- **Dictionary APIs:** Native audio pronunciation files and formal definitions.

### Tier 3: Generative AI (Premium/Fallback)
Used only if Tier 1 and Tier 2 fail, or if the teacher manually requests an "Upgrade."
- **Nano Banana (Image):** Generates style-consistent vector or cartoon images.
- **Nano Banana (Audio):** Creates character-specific voices or theme-based chants.

---

## 3. The Asset Refinement Pipeline
To ensure high quality on 4K Classroom Boards:
1. **Background Removal:** Raw PNGs from web/AI are processed by `rembg`.
2. **Vectorization:** Complex images are converted to clean SVGs (via Vectorizer API) to prevent pixelation.
3. **Normalization:** All audio levels are balanced to prevent sudden volume spikes in class.

## 4. Licensing & Safety
- **Safe Search:** All external search queries are forced with `safe_search=true`.
- **Copyright:** Metadata stores the origin of every asset for compliance.
