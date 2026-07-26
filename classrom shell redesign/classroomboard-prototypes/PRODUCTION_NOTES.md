# ClassroomBoard — Production Notes

## Shared Shell Layout

### Zones + Positions (1920×1080 canvas)

| Zone | Position | Dimensions | Notes |
|------|----------|------------|-------|
| **Phase Arc Rail** | `absolute top-0 left-0 right-0` | `h-20 (80px)` | Header strip with 6 phase nodes |
| **Team Score Rail** | Grid col 1 | `w-[260px]` | Left sidebar |
| **Center Stage** | Grid col 2 | `flex-1` | Content area (changes per screen) |
| **Leaderboard Rail** | Grid col 3 | `w-[240px]` | Right sidebar |
| **Whose Turn Banner** | `absolute bottom-0 left-0 right-0` | `h-[100px]` | Footer |
| **Round Mode Badge** | `absolute left-[274px]` in footer | pill | 🙋 INDIVIDUAL / TEAM |

### Grid Template
```
grid-cols-[260px_1fr_240px]
```
With `gap-4 px-6 pt-4 pb-[108px]` (top:80px header offset, bottom:100px footer offset).

---

## Color System (Phase → Tailwind Classes)

| Phase | Primary | Accent | Glow/Shadow |
|-------|---------|--------|-------------|
| **WARMUP** | `bg-amber-500` | `text-amber-400` | `shadow-amber-500/30` |
| **INPUT** | `bg-blue-500` | `text-blue-400` | `shadow-blue-500/35` |
| **OUTPUT** | `bg-amber-600` | `text-amber-300` | `shadow-amber-600/30` |
| **PRACTICE** | `bg-green-500` | `text-green-300` | `shadow-green-500/30` |
| **ASSESS** | `bg-red-500` | `text-red-400` | `shadow-red-500/35` |
| **WRAPUP** | `bg-purple-500` | `text-purple-300` | `shadow-purple-500/35` |
| **Neutral BG** | `bg-gradient-to-br from-slate-900 to-slate-950` | — | — |

---

## Typography Scale

| Usage | Tailwind Size | Weight | Font |
|-------|---------------|--------|------|
| **Hero headlines** (flashcard word) | `text-7xl` to `text-9xl` | `font-black` | Fredoka |
| **Scores** (team scores) | `text-7xl` | `font-black` | Fredoka |
| **Body/dialogue** | `text-3xl` to `text-5xl` | `font-bold` | Inter |
| **Labels/badges** | `text-xl` to `text-2xl` | `font-bold` | Fredoka |
| **Chinese gloss** | `text-4xl` to `text-6xl` | `font-medium` | Noto Sans SC |
| **Phase labels** | `text-sm` to `text-base` | `font-semibold` | Fredoka |
| **Clock/metadata** | `text-[15px]` | `font-medium` | Inter (tabular-nums) |

### Font Setup
```javascript
tailwind.config = { theme: { extend: { fontFamily: {
  display: ['Fredoka','sans-serif'],
  body: ['Inter','sans-serif'],
  cn: ['Noto Sans SC','sans-serif']
}}}};
```

---

## Animation Inventory

### Shared (all screens)
| Animation | CSS Keyframe | Used For | Framer Motion Equivalent |
|-----------|-------------|----------|--------------------------|
| `nodePulse` | `box-shadow + transform:scale` | Active phase node glow | `animate: { scale: [1, 1.06, 1] }` with repeat |
| `scorePop` | `opacity + translateY` | "+12" score increment popup | `AnimatePresence` exit animation |
| `bannerGlow` | `box-shadow` pulsing | Whose-turn banner | `animate: { boxShadow: [...] }` |
| `spotlightSweep` | `rotate 0→360deg` (conic gradient) | Turn banner spotlight | CSS animation (no direct Framer equivalent) |
| `avatarPulse` | `box-shadow` pulsing | Turn avatar | Same as bannerGlow |

### Screen-specific
| Animation | Screen | Used For |
|-----------|--------|----------|
| `cardFloat` | 01-shell, 02-vocab-drill | Flashcard floating up/down |
| `particleDrift` | 01-shell, 02-vocab-grid | Ambient particles rising |
| `fadeInUp` | 03-story, 04-listen-tap, 05-speed-quiz-results | Content entrance (staggered) |
| `speakerRing` | 04-listen-tap | Pulsing rings around speaker icon |
| `timerRing` | 05-speed-quiz-question | SVG countdown ring |
| `shake` | 05-speed-quiz-question | Answer tiles when time is low |
| `confettiFall` | 05-speed-quiz-results | Celebration confetti |
| `podiumRise` | 05-speed-quiz-results | Podium tiers sliding up |
| `crownBounce` | 05-speed-quiz-results | Crown on 1st place |
| `glowPulse` | 06-team-battle, 07-wheel | Winner border glow |
| `wheelIdle` | 07-wheel-idle | Subtle wheel wobble |
| `wheelSpin` | 07-wheel-reveal | 5 rotations (4s ease-out) |

### Framer Motion Patterns
```typescript
// Card float
<motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 4, repeat: Infinity }} />

// Fade in up (staggered)
<motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
  transition={{ delay: index * 0.1 }} />

// Score popup
<AnimatePresence>
  {showPopup && <motion.div initial={{ opacity: 0.9, y: 0 }}
    animate={{ opacity: 0, y: -25 }} transition={{ duration: 2.5, repeat: Infinity }} />}
</AnimatePresence>

// Timer ring
<motion.circle initial={{ strokeDashoffset: 0 }}
  animate={{ strokeDashoffset: 283 }} transition={{ duration: 10, ease: "linear" }} />
```

---

## Component Map

| File | Screen | React Component | Props Needed |
|------|--------|-----------------|--------------|
| `01-shell.html` | ClassroomBoard Shell | `<ClassroomBoard>` | `phase, activePhase, teams[], leaderboard[], currentStudent, round, totalRounds, mode` |
| `02-vocab-grid.html` | Vocab overview grid | `<BoardFocusCards variant="grid">` | `vocab[], activeIndex` |
| `02-vocab-drill.html` | Vocab drill (enlarged card) | `<BoardFocusCards variant="drill">` | `vocab[], currentIndex, onNext, onPrev` |
| `03-story-stage.html` | Story dialogue page | `<BoardStoryStage>` | `story{title, panels[]}, currentPanel` |
| `04-listen-tap.html` | Listen & Tap (options) | `<BoardListenTap>` | `audioUrl, options[], correctIndex, onAnswer` |
| `05-speed-quiz-question.html` | Speed Quiz (question+timer) | `<BoardSpeedQuiz variant="question">` | `question, options[], timeLimit, onAnswer` |
| `05-speed-quiz-results.html` | Speed Quiz (results/podium) | `<BoardSpeedQuiz variant="results">` | `results[], onNextRound` |
| `06-team-battle.html` | Team Battle (grid+rosters) | `<BoardTeamBattle>` | `teams[Red, Blue], teamScores, winningTeam` |
| `07-wheel-idle.html` | Wheel idle state | `<BoardWheelOfDestiny variant="idle">` | `students[], onSpin` |
| `07-wheel-reveal.html` | Wheel landing reveal | `<BoardWheelOfDestiny variant="reveal">` | `students[], selectedStudent` |

### Proposed Shell Component Structure
```tsx
<ClassroomBoard phase="input" activePhase="input"
  teams={[{name:"Red",color:"red",score:450}, {name:"Blue",color:"blue",score:380}]}
  leaderboard={[{name:"Mia",avatar:"🦊",score:120}, ...]}
  currentStudent={{name:"Leo",avatar:"🦁",team:"red"}}
  round={3} totalRounds={5} mode="individual">
  
  {/* Center content changes per screen */}
  <BoardFocusCards vocab={unitVocab} />
</ClassroomBoard>
```

---

## Content Data Model

### Example Content (use across all prototypes)
```typescript
const students = [
  { name: "Leo", avatar: "🦁", team: "red", score: 110 },
  { name: "Mia", avatar: "🦊", team: "red", score: 120 },
  { name: "Ben", avatar: "🐻", team: "red", score: 74 },
  { name: "Tom", avatar: "🐯", team: "red", score: 95 },
  { name: "Jenny", avatar: "🦋", team: "blue", score: 82 },
  { name: "Sam", avatar: "🐧", team: "blue" },
  { name: "Ada", avatar: "🦉", team: "blue" },
  { name: "Zoe", avatar: "🦓", team: "blue" },
];

const vocab = [
  { word: "Elephant", emoji: "🐘", ipa: "/ˈelɪfənt/", cn: "大象" },
  { word: "Zebra", emoji: "🦓", ipa: "/ˈziːbrə/", cn: "斑马" },
  { word: "Tiger", emoji: "🐯", ipa: "/ˈtaɪɡər/", cn: "老虎" },
  { word: "Giraffe", emoji: "🦒", ipa: "/dʒəˈræf/", cn: "长颈鹿" },
  { word: "Monkey", emoji: "🐵", ipa: "/ˈmʌŋki/", cn: "猴子" },
];

const teams = {
  red: { name: "Team Red", color: "#EF4444", score: 450 },
  blue: { name: "Team Blue", color: "#3B82F6", score: 380 },
};
```

---

## OD Infrastructure Notes

- **OD Container**: `~/open-design/deploy/docker-compose.yml`
- **Kilo Agent**: v7.0.46, mounted from host npm-global, credentials from `~/.local/share/kilo`
- **Custom Entrypoint**: `~/open-design/deploy/entrypoint.sh` — creates kilo symlink, sets writable HOME
- **API calls**: Must use `docker exec open-design wget` (Clash Verge TUN intercepts localhost)
- **Project**: `classroomboard-shell-v2` at `http://localhost:7456/projects/classroomboard-shell-v2`
