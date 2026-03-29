Phase 1 Complete: Auth Pipeline Fixed

Phase 2 & 3 Complete: 404s Purged and Mock Data Eradicated. DataService, Store, and Apps are 100% data-driven.

Phase 6 Complete: The AI Professor MVP successfully integrated with mock AIService delay and direct Supabase insertion for units and srs_items.

### Universal AI Architecture (Phase 7)
The AI Professor feature now uses a universal architecture via Supabase Edge Functions (`generate-lesson`). This secures API keys and allows plugging in any OpenAI-compatible endpoint (OpenRouter, DeepSeek, Kimi, Qwen).

**Environment Variables Required in Supabase Project Settings:**
- `AI_BASE_URL` (e.g., https://openrouter.ai/api/v1)
- `AI_API_KEY` (Your secret key)
- `AI_MODEL_NAME` (e.g., mistralai/mistral-7b-instruct:free)

**Deployment Instructions:**
To deploy the Edge Function to your remote Supabase Project, run:
```bash
npx supabase functions deploy generate-lesson --no-verify-jwt
```
Then, add the environment variables via the Supabase Dashboard.

### Multi-Modal Omni-Router (Phase 8)
The `generate-lesson` Edge Function was upgraded to serve as an Omni-Router. It performs parallel generation tasks returning a unified multimodal payload:
- **Text Generation (OpenRouter/Mistral)**: Generates the core JSON object (title, description, visual_prompt, spoken_intro, flashcards).
- **Image Generation (Google Generative AI/Nano Banana 2)**: Reads the `visual_prompt` and triggers the Gemini model via the Google AI Studio endpoint if `GOOGLE_API_KEY` is configured.
- **Audio Voice Synthesis (ElevenLabs)**: Reads the `spoken_intro` and synthesizes voice generation via the ElevenLabs text-to-speech API if `ELEVENLABS_API_KEY` is configured.
These generations execute concurrently using `Promise.all` and are hydrated directly into the `units` table (`image_url`, `audio_url`).
