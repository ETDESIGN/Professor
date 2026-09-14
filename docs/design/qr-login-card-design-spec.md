# Professor QR Login Card ("QR Passport") — Design Specification
**Document Version:** 1.1.0  
**Target File:** `docs/design/qr-login-card-design-spec.md`  
**Status:** Approved for Implementation  
**Audience:** UI Designers (Google Stitch), Frontend Engineers (Vite/React/Print CSS), Product Teams

> **v2 (2026-09-15, owner decision): ONE "Family Pocket Passport" card per student.**
> Instead of separate student and parent cards, a single A5-landscape card carries
> BOTH logons side by side: a STUDENT pass panel (pink tint, grad-cap robot, star
> badge, its own QR + credentials) and a PARENT pass panel (blue tint, heart robot,
> heart badge, its own QR + credentials), divided by a dashed seam with a
> star+heart emblem. Header shows the PROFESSOR wordmark, class pill, a two-tone
> gradient "FAMILY PASS" badge and the student's name; footer explains the
> one-card-per-family idea. Students with no parent login yet print a single
> full-width student pass. All §7 print engineering (A5 halves on A4, cut guide,
> quiet zones, EC level Q) applies unchanged.  

---

## 1. Concept Name & Rationale

### 1.1 Concept Name
**"The Professor Academy Pocket Passport" (教授英语探险通行证)**

* **Student Variant:** *Explorer Pass (学员探险卡)* — Gamified, energetic, rewarding.
* **Parent Variant:** *Family Companion Pass (家长伴学卡)* — Reassuring, clear, supportive.

### 1.2 Pedagogical & Practical Rationale
1. **Delight for Young Learners (Ages 6–12):** Entering a username and password on a virtual keyboard is error-prone and frustrating for primary students. Holding a physical, badge-like "Passport" turns authentication into an exciting ritual: *“Scan your passport to enter the English Adventure!”*
2. **Frictionless Onboarding for Families:** Most elementary students share a mobile device with parents or use a household iPad. By leveraging the smartphone’s native camera to scan the QR code (which directly loads `{origin}/login#p=<base64url>` without requiring app installation), friction drops to zero.
3. **Teacher Printing Reality (Cheap School Printers):**
   * **No Ink Floods:** Large dark backgrounds soak standard 70–80 gsm copy paper, causing curling, bleed-through, and toner depletion. The Passport uses **90%+ white paper ground**, lightweight tinted containers (3%–8% opacity), and crisp 1.5pt vector line work.
   * **A5 Half-Sheet Standard:** Two A5 landscape cards fit on one single portrait A4 sheet ($210\,\text{mm} \times 297\,\text{mm}$). A single horizontal scissor cut across the middle ($Y = 148.5\,\text{mm}$) yields two ready-to-distribute cards.
   * **Fail-Safe Monochromatic Rendering:** Even if a teacher prints on an ancient single-drum black-and-white laser copier, distinct visual textures (stars vs. shields) and high-contrast typography ensure Student and Parent cards cannot be confused.

---

## 2. Exact A5 Landscape Layout & Dimensions (in mm)

### 2.1 Sheet Geometry
* **Master Paper Sheet:** ISO A4 Portrait ($210.0\,\text{mm} \times 297.0\,\text{mm}$).
* **Cut Line:** Exactly at $Y = 148.5\,\text{mm}$ (horizontal cut).
* **Finished Card Dimensions:** A5 Landscape ($210.0\,\text{mm} \text{ wide} \times 148.5\,\text{mm} \text{ high}$).
* **Printer Non-Printable Margin Allowance:** $8.0\,\text{mm}$ around the physical paper edge.
* **Effective Content Canvas:** $194.0\,\text{mm} \times 132.5\,\text{mm}$ centered within each A5 card.

```
┌─────────────────────────────────────────────────────────────────────────┐ ▲
│ 8mm Top Margin                                                          │ │
│  ┌───────────────────────────────────────────────────────────────────┐  │ │
│  │ ZONE 1: Header Brand & Role Strip (Height: 20mm)                  │  │ │
│  ├───────────────────────────────────────────────────────────────────┤  │ │
│  │ ZONE 2: Main Body Grid (Height: 96mm)                             │  │ │
│  │ ┌───────────────────────────┬───────────────────────────────────┐ │  │ │ 148.5mm
│  │ │ ZONE 2A:                  │ ZONE 2B:                          │ │  │ │ (CARD 1:
│  │ │ Hero QR "Magic Portal"    │ Student Credentials & Manual Keys │ │  │ │  STUDENT)
│  │ │ Width: 74mm               │ Width: 114mm                      │ │  │ │
│  │ └───────────────────────────┴───────────────────────────────────┘ │  │ │
│  ├───────────────────────────────────────────────────────────────────┤  │ │
│  │ ZONE 3: Footer Support & Instruction Strip (Height: 12mm)         │  │ │
│  └───────────────────────────────────────────────────────────────────┘  │ │
│ 8mm Bottom Margin                                                       │ │
├- - - - - - - - - - - - - - - - ✂ CUT HERE ✂ - - - - - - - - - - - - - - ┤ ▼ Y = 148.5mm
│ 8mm Top Margin                                                          │ ▲
│  ┌───────────────────────────────────────────────────────────────────┐  │ │
│  │ ZONE 1: Header Brand & Role Strip (Height: 20mm)                  │  │ │
│  ├───────────────────────────────────────────────────────────────────┤  │ │
│  │ ZONE 2: Main Body Grid (Height: 96mm)                             │  │ │
│  │ ┌───────────────────────────┬───────────────────────────────────┐ │  │ │ 148.5mm
│  │ │ ZONE 2A:                  │ ZONE 2B:                          │ │  │ │ (CARD 2:
│  │ │ Hero QR "Magic Portal"    │ Parent Credentials & Manual Keys  │ │  │ │  PARENT)
│  │ │ Width: 74mm               │ Width: 114mm                      │ │  │ │
│  │ └───────────────────────────┴───────────────────────────────────┘ │  │ │
│  ├───────────────────────────────────────────────────────────────────┤  │ │
│  │ ZONE 3: Footer Support & Instruction Strip (Height: 12mm)         │  │ │
│  └───────────────────────────────────────────────────────────────────┘  │ │
│ 8mm Bottom Margin                                                       │ │
└─────────────────────────────────────────────────────────────────────────┘ ▼ 297.0mm
```

---

### 2.2 Zone Coordinate Map (Relative to A5 Card Top-Left: $0, 0$)

| Zone | X Start | Y Start | Width | Height | Core Contents |
|---|---|---|---|---|---|
| **Outer Border** | $6.0\,\text{mm}$ | $6.0\,\text{mm}$ | $198.0\,\text{mm}$ | $136.5\,\text{mm}$ | Rounded card boundary ($r = 5\,\text{mm}$), $1.5\,\text{pt}$ border. |
| **Zone 1: Header Strip** | $10.0\,\text{mm}$ | $10.0\,\text{mm}$ | $190.0\,\text{mm}$ | $20.0\,\text{mm}$ | Mascot logo, App Wordmark, Class Name, Role Badge. |
| **Zone 2A: Hero QR Portal** | $10.0\,\text{mm}$ | $33.0\,\text{mm}$ | $72.0\,\text{mm}$ | $92.0\,\text{mm}$ | Mascot speech bubble, QR code ($36\,\text{mm}$), scan reticle. |
| **Zone 2B: Credentials & Keys** | $86.0\,\text{mm}$ | $33.0\,\text{mm}$ | $114.0\,\text{mm}$ | $92.0\,\text{mm}$ | Display Name, Username Chip, Password Chip, 3-step guide. |
| **Zone 3: Footer Strip** | $10.0\,\text{mm}$ | $127.0\,\text{mm}$ | $190.0\,\text{mm}$ | $13.0\,\text{mm}$ | Safe-storage tip, web URL fallback, help desk reference. |

---

## 3. Brand Color Palette & Grayscale Fallback Mapping

The color palette builds upon Professor’s existing **Duo Berry** palette (`#E91E63` primary, `#1CB0F6` secondary, `#FFC800` accent), adapted specifically for reflective physical printing.

### 3.1 Color Specifications

```
STUDENT VARIANT (Duo Pink / Berry Explorer)
┌───────────────────┬───────────────────┬───────────────────┬───────────────────┐
│ Primary Pink      │ Dark Berry        │ Sunny Gold        │ Soft Ground Tint  │
│ #E91E63           │ #BE185D           │ #FFC800           │ #FFF1F5           │
│ CMYK: 0/95/40/0   │ CMYK: 0/98/50/25  │ CMYK: 0/20/100/0  │ CMYK: 0/7/2/0     │
└───────────────────┴───────────────────┴───────────────────┴───────────────────┘

PARENT VARIANT (Duo Blue / Family Companion)
┌───────────────────┬───────────────────┬───────────────────┬───────────────────┐
│ Primary Blue      │ Deep Navy         │ Emerald Mint      │ Soft Sky Tint     │
│ #1CB0F6           │ #0284C7           │ #10B981           │ #F0F9FF           │
│ CMYK: 80/15/0/0   │ CMYK: 90/35/0/10  │ CMYK: 75/0/60/0   │ CMYK: 4/1/0/0     │
└───────────────────┴───────────────────┴───────────────────┴───────────────────┘

SHARED NEUTRALS & CREDENTIAL GROUND
┌───────────────────┬───────────────────┬───────────────────┬───────────────────┐
│ Deep Text Slate   │ Muted Label Slate │ Hairline Border   │ Pure White Paper  │
│ #0F172A           │ #475569           │ #CBD5E1           │ #FFFFFF           │
│ CMYK: 70/60/50/80 │ CMYK: 50/35/25/30 │ CMYK: 15/10/10/5  │ CMYK: 0/0/0/0     │
└───────────────────┴───────────────────┴───────────────────┴───────────────────┘
```

### 3.2 Grayscale Fallback Mapping (For Mono Laser Copiers)
When printed without color toner, standard inks often blend together into muddy mid-grays. The design guarantees high visual differentiation by assigning each element to specific reflectance brackets:

| Color Element | Full-Color Hex | 8-Bit Gray Equivalent | Optical Density / Visual Texture |
|---|---|---|---|
| **Student Role Badge Fill** | `#E91E63` (Pink) | `#4A4A4A` (70% Black) | Solid dark gray pill with **reverse white text** + Star Icon. |
| **Parent Role Badge Fill** | `#1CB0F6` (Blue) | `#8C8C8C` (45% Black) | Medium gray pill with **white text** + Shield/Heart Icon. |
| **Hero QR Modules** | `#000000` | `#000000` (100% Solid Black) | Maximum possible optical density ($D_{\max} > 1.4$). |
| **QR Frame Background** | `#FFF1F5` / `#F0F9FF` | `#F8F8F8` (3%–5% Black) | Near-white; preserves the vital 4-module QR quiet zone. |
| **Credential Box Fills** | `#FFFFFF` | `#FFFFFF` (0% Black) | Crisp white interior with $1.5\,\text{pt}$ solid `#475569` border. |
| **Manual Passwords/Usernames** | `#0F172A` | `#000000` (100% Solid Black) | Ultra-sharp text; zero toner feathering. |

---

## 4. Typography Scale

The application self-hosts rounded, friendly fonts (`Fredoka` for display titles, `Nunito` for UI labels, and `JetBrains Mono` for alphanumeric credentials). All font sizes are defined in absolute points ($\text{pt}$) for print stability.

| Element | Font Family | Weight | Size ($\text{pt} / \text{mm}$) | Line Height | Tracking | Purpose / Rules |
|---|---|---|---|---|---|
| **App Title** | `Fredoka`, sans-serif | Bold (700) | $13\,\text{pt}$ ($4.6\,\text{mm}$) | $16\,\text{pt}$ | $+0.5\,\text{pt}$ | Header brand label ("PROFESSOR"). |
| **Role Badge** | `Fredoka`, sans-serif | SemiBold (600) | $11\,\text{pt}$ ($3.9\,\text{mm}$) | $14\,\text{pt}$ | $+1.0\,\text{pt}$ | ALL CAPS: "STUDENT PASS" / "PARENT PASS". |
| **Student Display Name** | `Fredoka`, `Noto Sans SC` | Bold (700) | $20\,\text{pt}$ ($7.1\,\text{mm}$) | $24\,\text{pt}$ | Normal | Hero student name (supports Chinese + English). |
| **Class Name Pill** | `Nunito`, sans-serif | SemiBold (600) | $10\,\text{pt}$ ($3.5\,\text{mm}$) | $12\,\text{pt}$ | Normal | Class identifier (e.g., "Grade 3 • Sunflower"). |
| **Credential Field Labels** | `Nunito`, sans-serif | ExtraBold (800) | $7\,\text{pt}$ ($2.5\,\text{mm}$) | $9\,\text{pt}$ | $+1.2\,\text{pt}$ | ALL CAPS: "USERNAME / 账号", "PASSWORD / 密码". |
| **Username & Password** | `JetBrains Mono`, mono | Bold (700) | $13\,\text{pt}$ ($4.6\,\text{mm}$) | $15\,\text{pt}$ | $+1.5\,\text{pt}$ | High legibility; slashed zeros (`0`), clear `1/l/I`. |
| **Scan Speech Bubble** | `Fredoka`, sans-serif | Medium (500) | $9\,\text{pt}$ ($3.2\,\text{mm}$) | $11\,\text{pt}$ | Normal | Mascot callout: "Scan with any camera! 📸". |
| **3-Step Instructions** | `Nunito`, sans-serif | SemiBold (600) | $8\,\text{pt}$ ($2.8\,\text{mm}$) | $10\,\text{pt}$ | Normal | Quick pictorial instructions (1, 2, 3). |
| **Footer Disclaimers** | `Nunito`, sans-serif | Regular (400) | $7.5\,\text{pt}$ ($2.6\,\text{mm}$) | $9.5\,\text{pt}$ | Normal | URL fallback, support notes, fridge magnet tip. |

---

## 5. Precise SVG Illustration Direction

All decorative artwork, mascot poses, and badge icons **must be rendered in pure inline vector SVG**. No external bitmap URLs (`.png`, `.jpg`) are permitted, guaranteeing $1200\,\text{DPI}$ vector fidelity and zero network dropouts during `@media print`.

### 5.1 Mascot Character: "Professor Robot"
* **Visual Anchor:** The friendly box-head learning robot already familiar to students (`public/art/mascot.svg`).
* **Design Traits:** Sky-blue rounded head (`#38BDF8`), pink spherical antenna bulb (`#E91E63`), warm friendly smile, and high-contrast dark eyes with white glints.

#### Variant A: Student Pose (Explorer / Adventure)
* **Pose:** Waving right hand forward with a golden star graduation cap (`#FFC800`).
* **Placement:** Top-left of the QR Portal ($X = 14\,\text{mm}, Y = 30\,\text{mm}$), peeking over the QR frame.
* **Inline SVG Reference Structure:**
```xml
<svg viewBox="0 0 100 90" width="26mm" height="23mm" xmlns="http://www.w3.org/2000/svg">
  <!-- Antenna with pink signal ball -->
  <line x1="50" y1="12" x2="50" y2="25" stroke="#64748B" stroke-width="3" stroke-linecap="round"/>
  <circle cx="50" cy="10" r="6" fill="#E91E63"/>
  <!-- Graduation Cap / Adventure Visor -->
  <polygon points="50,4 72,12 50,20 28,12" fill="#FFC800" stroke="#B45309" stroke-width="1.5"/>
  <line x1="72" y1="12" x2="74" y2="24" stroke="#B45309" stroke-width="1.5"/>
  <!-- Head -->
  <rect x="22" y="24" width="56" height="42" rx="12" fill="#38BDF8" stroke="#0284C7" stroke-width="2"/>
  <rect x="28" y="30" width="44" height="28" rx="8" fill="#E0F2FE"/>
  <!-- Eyes with bright glints -->
  <circle cx="40" cy="42" r="5" fill="#0F172A"/>
  <circle cx="60" cy="42" r="5" fill="#0F172A"/>
  <circle cx="42" cy="40" r="1.8" fill="#FFFFFF"/>
  <circle cx="62" cy="40" r="1.8" fill="#FFFFFF"/>
  <!-- Smile -->
  <path d="M42 51 Q50 58 58 51" stroke="#0F172A" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <!-- Waving Hand -->
  <circle cx="84" cy="38" r="6" fill="#38BDF8" stroke="#0284C7" stroke-width="1.5"/>
</svg>
```

#### Variant B: Parent Pose (Guardian / Guide)
* **Pose:** Friendly, reassuring robot holding an open book/tablet with a small heart badge (`#E91E63`).
* **Placement:** Top-left of the QR Portal, looking encouragingly toward the credentials.
* **Inline SVG Reference Structure:**
```xml
<svg viewBox="0 0 100 90" width="26mm" height="23mm" xmlns="http://www.w3.org/2000/svg">
  <!-- Antenna with blue calming beacon -->
  <line x1="50" y1="12" x2="50" y2="25" stroke="#64748B" stroke-width="3" stroke-linecap="round"/>
  <circle cx="50" cy="10" r="6" fill="#1CB0F6"/>
  <!-- Head -->
  <rect x="22" y="24" width="56" height="42" rx="12" fill="#38BDF8" stroke="#0284C7" stroke-width="2"/>
  <rect x="28" y="30" width="44" height="28" rx="8" fill="#E0F2FE"/>
  <!-- Welcoming eyes & smile -->
  <circle cx="40" cy="42" r="4.5" fill="#0F172A"/>
  <circle cx="60" cy="42" r="4.5" fill="#0F172A"/>
  <circle cx="42" cy="40.5" r="1.5" fill="#FFFFFF"/>
  <circle cx="62" cy="40.5" r="1.5" fill="#FFFFFF"/>
  <path d="M43 51 Q50 57 57 51" stroke="#0F172A" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  <!-- Heart Badge Held in Chest -->
  <path d="M78 48 C78 44, 82 42, 85 45 C88 42, 92 44, 92 48 C92 53, 85 57, 85 57 C85 57, 78 53, 78 48 Z" fill="#E91E63"/>
</svg>
```

---

### 5.2 Creative QR Framing: "The Explorer Portal Frame"
The QR code is framed as an interactive optical viewfinder / passport seal:
1. **The Reticle Frame:** Four corner bracket markers (`L`-brackets, stroke: $2.5\,\text{pt}$, length: $8\,\text{mm}$) hugging the outer boundary of the QR code quiet zone.
2. **Quiet Zone Shield:** Pure solid white square ($46\,\text{mm} \times 46\,\text{mm}$) directly beneath the $38\,\text{mm} \times 38\,\text{mm}$ QR code, guaranteeing $4.0\,\text{mm}$ of uninterrupted clear margin on all sides.
3. **Mascot Speech Bubble:** Attached to the top edge of the frame:
   * Capsule with small tail pointing to the robot.
   * Text: `Scan to jump in! 🚀` (Student) / `Scan to view progress 📱` (Parent).

---

## 6. Student vs. Parent Differences

To prevent families from mixing up credentials, the two cards feature deliberate, multi-sensory differences across color, iconography, copy, and structural accents:

| Dimension | Student Variant (学员卡) | Parent Variant (家长卡) |
|---|---|---|
| **Card Subtitle** | `STUDENT ADVENTURE PASS` (学员探险卡) | `PARENT COMPANION PASS` (家长伴学卡) |
| **Primary Theme Color** | Duolingo Pink (`#E91E63`) | Duolingo Blue (`#1CB0F6`) |
| **Secondary Accent** | Sunny Yellow (`#FFC800`) | Emerald Mint (`#10B981`) |
| **Mascot Badge** | Robot with graduation cap & star | Robot holding companion heart tablet |
| **Card Seal Pattern** | Star-burst watermark seal in header | Twin-leaf shield seal in header |
| **Scan Callout** | *"Scan to start your mission!"* | *"Scan to hear recordings & track XP"* |
| **3-Step Flow Focus** | 1. Open Camera<br>2. Scan QR<br>3. Play & Learn | 1. Open Camera<br>2. Scan QR<br>3. Review Homework & Audio |
| **Storage Advice** | *"Keep in your pencil case or English binder!"* | *"Put this card on your refrigerator door!"* |
| **Grayscale ID** | Solid 70% dark gray badge + ★ Star icon | 45% medium gray badge + 🛡️ Shield icon |

---

## 7. Print & Cut Engineering Notes

### 7.1 Cut Line Execution
* **Placement:** $Y = 148.5\,\text{mm}$ across the full $210.0\,\text{mm}$ width.
* **Cut Indicator:**
  * Line style: $0.75\,\text{pt}$ dashed line with dash length $3\,\text{mm}$ and gap $2\,\text{mm}$.
  * Stroke color: `#94A3B8` (Slate-400, discreet enough to not look like a flaw if cut is slightly off).
  * Centered scissor glyph: An inline SVG scissor icon `✁` with text: `✂ CUT HERE / 此处裁剪 ✂`.
* **Cut Buffer / Bleed Safety:** A total vertical exclusion buffer of $10.0\,\text{mm}$ ($5.0\,\text{mm}$ above and $5.0\,\text{mm}$ below the cut line). No text, borders, or critical information may sit in the region $Y = 143.5\,\text{mm}$ to $Y = 153.5\,\text{mm}$.

---

### 7.2 Printable Margin & Bleed Rules
* Standard office copiers (HP LaserJet, Brother, Canon) cannot print full-bleed to the paper edge; they require a physical gripper margin of $4.0\,\text{mm} - 6.0\,\text{mm}$.
* **Rule:** All visible graphics and text must remain strictly within an $8.0\,\text{mm}$ safe perimeter around the entire A4 sheet ($X \in [8, 202]\,\text{mm}, Y \in [8, 289]\,\text{mm}$).

---

### 7.3 QR Scanner Reliability & Quiet Zone
According to ISO/IEC 18004 specifications:
* **Minimum Physical Size:** The generated QR code modules must span at least $32.0\,\text{mm} \times 32.0\,\text{mm}$ (spec specifies $38.0\,\text{mm}$ for effortless scanning from $30\,\text{cm}$ away).
* **Quiet Zone (Margin):** At least $4$ module widths of solid white ground ($#FFFFFF$) must surround the matrix. At $38\,\text{mm}$, this equates to $\ge 4.0\,\text{mm}$ of clean white space on all 4 sides before any border or bracket begins.
* **Error Correction Level:** Must be generated at **Level M** ($15\%$ redundancy) or **Level Q** ($25\%$ redundancy). This ensures the QR code scans instantly even if a child wrinkles the card or gets pencil marks on it.

---

### 7.4 HTML & CSS `@media print` Implementation Blueprint

To ensure pixel-perfect rendering across Chrome, Safari, and Edge print dialogs, implement the following CSS contract:

```css
@media print {
  /* Enforce A4 Portrait master sheet with zero default browser margins */
  @page {
    size: A4 portrait;
    margin: 0;
  }

  *, *::before, *::after {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  body {
    margin: 0;
    padding: 0;
    background: #ffffff;
  }

  /* Container: Exactly A4 dimensions */
  .a4-passport-sheet {
    width: 210mm;
    height: 297mm;
    position: relative;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
    background: #ffffff;
  }

  /* Individual A5 Landscape Card */
  .a5-passport-card {
    width: 210mm;
    height: 148.5mm;
    box-sizing: border-box;
    padding: 8mm;
    position: relative;
    overflow: hidden;
  }

  /* Horizontal Cut Line Guide */
  .cut-line-guide {
    position: absolute;
    top: 148.5mm;
    left: 8mm;
    right: 8mm;
    height: 1px;
    border-top: 1px dashed #94a3b8;
    display: flex;
    align-items: center;
    justify-content: center;
    transform: translateY(-50%);
    z-index: 50;
  }

  .cut-line-label {
    background: #ffffff;
    padding: 0 4mm;
    font-family: 'Nunito', sans-serif;
    font-size: 7pt;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5pt;
  }

  /* High contrast credential text rendering */
  .credential-value {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
    letter-spacing: 0.8pt;
    color: #0f172a;
    -webkit-font-smoothing: antialiased;
  }
}
```

---

## 8. Summary Checklist for Google Stitch Agent

When generating the visual mockups and screens in Stitch:
* [x] **Dimensions:** Set canvas to $210\,\text{mm} \times 148.5\,\text{mm}$ (or proportional $1680 \times 1188\,\text{px}$ at $8:5.66$ ratio).
* [x] **Ground:** Clean white paper base with a $1.5\,\text{pt}$ rounded border ($r = 20\,\text{px}$).
* [x] **Hero QR:** Framed inside a $38\,\text{mm}$ camera reticle on the left, flanked by a waving robot mascot.
* [x] **Student Card:** Duo Pink `#E91E63` header, star badges, energetic tone.
* [x] **Parent Card:** Duo Blue `#1CB0F6` header, shield/heart badges, reassuring companion tone.
* [x] **Credentials:** Clear username and password chips with key/user icons.
* [x] **Instructions:** 3-step pictorial guide (`1. Camera` $\rightarrow$ `2. Scan` $\rightarrow$ `3. Tap Link`).
* [x] **Zero External Images:** All illustrations and icons must be native SVG.
