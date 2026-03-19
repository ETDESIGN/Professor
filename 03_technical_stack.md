# 03. Technical Stack

## Frontend (Responsive Web App)
- **Framework:** React (Vite)
- **Styling:** Vanilla CSS (Modern design: glassmorphism, gradients, animations)
- **Animations:** CSS Keyframes / Framer Motion
- **Responsive Strategy:** Mobile-first PWA (Progressive Web App)
- **State Management:** React Context / Zustand
- **Real-time Engine:** Supabase Realtime (WebSockets)

## Backend & Database
- **Platform:** Supabase
- **Project Ref:** `jobqzsjooquwtxwplwax`
- **MCP Config:** See [23. Supabase MCP Configuration](file:///c:/Users/Etia/Documents/app%20dev/prof%20app/project_details/23_supabase_mcp_config.md)
- **Database:** PostgreSQL
- **Authentication:** Supabase Auth (Email, QR Code/PIN logic)
- **Storage:** Supabase Storage (Buckets for images, audio, video)
- **Serverless Logic:** Supabase Edge Functions (Deno / TypeScript)

## AI Integration (The "Brain")
- **Core Model:** Google Gemini 1.5 Pro & Flash
- **Capabilities:** 
    - **Vision:** Analyzing textbook layouts, OCR, character recognition.
    - **NLP:** Structuring unstructured data into JSON Blueprints.
    - **Generative:** Filling content gaps (Prompts for images/videos).
- **Secondary AI:** 
    - `rembg` (Background removal)
    - `vectorizer.ai` or equivalent (PNG -> SVG conversion)
    - ElevenLabs / Google TTS (Voice generation)

## Hosting & Deployment
- **Deployment:** Vercel or Google Cloud
- **CI/CD:** GitHub Actions

## Communication Protocol
- **Phone ↔ Board Sync:** Real-time bi-directional communication via Supabase Realtime Channels.
- **API:** RESTful Edge Functions for complex orchestration.
