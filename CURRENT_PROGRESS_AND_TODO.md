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
