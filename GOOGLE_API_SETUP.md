# Google & ElevenLabs API Configuration Guide

## Overview
The teacher app requires external API keys for:
- **Google Gemini API** - YouTube video search in Unit Content Vault
- **ElevenLabs API** - Audio generation for vocabulary (optional)

## Where to Get API Keys

### Google Gemini API (for YouTube Search)

#### Option 1: Google Cloud Console (Recommended)
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable the **YouTube Data API v3**:
   - APIs & Services > Library > Search "YouTube Data API v3"
   - Click Enable
4. Create credentials:
   - APIs & Services > Credentials
   - Click "Create Credentials" > "API key"
   - Copy the generated key

#### Option 2: Google AI Studio
1. Go to [Google AI Studio](https://makersuite.google.com/)
2. Create a new project
3. Get API key from project settings

### ElevenLabs API (Optional - for Audio)
1. Go to [ElevenLabs.io](https://elevenlabs.io)
2. Sign up for a free account
3. Get your API key from the dashboard

## Configure Environment Variables

### For Vercel Deployment (Production)
1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Navigate to your project → **Settings** → **Environment Variables**
3. Add variables:
   ```
   Key: VITE_GEMINI_API_KEY
   Value: your-google-api-key
   
   Key: VITE_ELEVENLABS_API_KEY (optional)
   Value: your-elevenlabs-api-key
   ```

### For Supabase Edge Functions
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to your project → **Settings** → **Environment Variables**
3. Add same variables as above

### For Local Development
Edit `.env` file in project root:
```bash
VITE_GEMINI_API_KEY=your-google-api-key
VITE_ELEVENLABS_API_KEY=your-elevenlabs-api-key  # Optional
```

## Testing Your Configuration

### Test YouTube Search
1. Open the app in browser
2. Navigate to Unit Content Vault
3. Try searching for a topic (e.g., "math song")
4. Verify YouTube videos appear in results

### Test Audio Generation
1. Go to vocabulary section
2. Click "Generate Audio" for a word
3. Verify audio plays correctly

## Security Notes

⚠️ **Never commit API keys to version control:**
- `.env` is in `.gitignore` (already configured)
- Only `.env.example` is tracked in git
- Each developer uses their own API keys

## Troubleshooting

### Issue: YouTube search returns no results
**Solutions:**
- ✅ Verify API key is correct
- ✅ Check Google Cloud Console for errors
- ✅ Ensure YouTube Data API v3 is enabled
- ✅ Verify key isn't restricted to specific IPs (for local dev)
- ✅ Check quota limits in Google Cloud Console

### Issue: "Invalid API key" error
**Solutions:**
- ✅ Verify key format is correct (no extra spaces)
- ✅ Check the correct project/environment
- ✅ Keys may take a few minutes to activate

### Issue: Rate limiting
**Solutions:**
- ✅ Add caching for YouTube searches
- ✅ Implement debouncing in search
- ✅ Consider upgrading to paid tier for higher limits

## Free Tier Quotas

### Google Gemini API
- Free tier: Sufficient for development
- Paid tier: Higher daily limits for production
- Monitor at: [Google Cloud Console > APIs & Services > Dashboard](https://console.cloud.google.com/apis/dashboard)

### ElevenLabs API
- Free tier: 10,000 characters/month
- Paid tier: Higher limits for production
- Monitor at: [ElevenLabs Dashboard](https://elevenlabs.io/dashboard)

## Production Deployment Checklist

- [ ] Google API key configured in Vercel
- [ ] ElevenLabs API key configured (if using audio)
- [ ] Supabase environment variables set
- [ ] Test YouTube search functionality
- [ ] Test audio generation
- [ ] Monitor API usage in Google Cloud Console
- [ ] Set up billing alerts (if using paid tier)

## Support

- [Google Cloud Documentation](https://cloud.google.com/docs)
- [YouTube Data API Guide](https://developers.google.com/youtube/v3)
- [ElevenLabs Documentation](https://elevenlabs.io/docs)
- Stack Overflow: tags `google-api-key`, `elevenlabs`
