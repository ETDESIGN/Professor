# 12. Avatar System (Hybrid SVG/AI)

## 1. Goal
To provide a high-quality, entertaining customization experience that works smoothly on low-end phones and giant 4K screens without the weight of 3D models.

## 2. Technical Architecture: "The Vector Paper Doll"

### The Base Skeleton (SVG)
- **Standardized Bases:** Human Boy, Human Girl, Robot, Alien, Monster.
- **Anchor Points:** Named coordinates in the SVG for:
    - `HEAD_TOP` (Hats)
    - `EYES_SLOT` (Glasses)
    - `BODY_MAIN` (Shirts/Jackets)
    - `BACK_SLOT` (Capes/Wings)
    - `HAND_L / HAND_R` (Held items)

### The Layering Loop
React renders the avatar as a stack of components:
1. `BaseBackLayer` (Capes)
2. `BaseBody` (Standard skin/limbs)
3. `FaceComponent` (Blinks/Smiles)
4. `ClothingItem` (Shirt)
5. `AccessoryItem` (Hats)

---

## 3. AI-Gen Pipeline (Nano Banana)
- **Asset Creation:** Teachers/Admins can prompt: "A sparkling galaxy wizard hat, cartoon style."
- **Processing:** 
    1. Nano Banana generates the image (PNG).
    2. Background is removed (`rembg`).
    3. Image is vectorized (PNG -> SVG).
- **Mapping:** The new item is tagged with a `SLOT` (e.g., `HEAD_TOP`) and added to the Shop.

---

## 4. Animation & Interactivity
- **CSS Transitions:** Small "Bounce" animations for breathing or "Win" celebrations.
- **Facial Expressions:** The `FaceComponent` takes a state prop: `mood="happy" | "sad" | "talking"`.
- **Real-time Sync:** When a student changes their outfit at home, the updated SVG config (JSON) reflects on the Classroom Board next time they are picked by the Wheel.

## 5. Data Representation
Avatars are stored as a lightweight JSON config in `profiles.avatar_config`:
```json
{
  "base": "robot_v2",
  "skin_color": "#00ffcc",
  "items": { "head": "viking_hat_01", "back": "jetpack_chrome" }
}
```
