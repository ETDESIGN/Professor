# 24. Infrastructure & Deployment Setup (GitHub & Vercel)

## 1. Goal
To establish a robust CI/CD pipeline and hosting environment using GitHub and Vercel, ensuring that every code push is automatically tested and deployed.

## 2. GitHub Configuration

### 1. Create Repository
- Create a new **private** repository (e.g., `lesson-orchestrator`).
- Push your local code:
  ```bash
  git init
  git add .
  git commit -m "initial commit"
  git branch -M main
  git remote add origin https://github.com/YOUR_USERNAME/lesson-orchestrator.git
  git push -u origin main
  ```

### 2. GitHub Secrets (Internal)
Go to **Settings > Secrets and variables > Actions** and add the following secrets for your CI/CD pipelines (if using GitHub Actions for custom builds):
- `SUPABASE_ACCESS_TOKEN` (For CLI deployments)

---

## 3. Vercel Configuration

### 1. Connect Project
- Go to [vercel.com](https://vercel.com) and click **"Add New" > "Project"**.
- Import your GitHub repository.

### 2. Environment Variables
In the Vercel project settings, add the following variables:
- `VITE_SUPABASE_URL`: Your Supabase Project URL.
- `VITE_SUPABASE_ANON_KEY`: Your Supabase Anonymous Key.
- `GOOGLE_GEMINI_API_KEY`: Your Gemini API Key (for server-side or Edge Function calls).

### 3. Build Settings (Vite Defaults)
- **Framework Preset:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Install Command:** `npm install`

---

## 4. Supabase Integration
Since the app uses Supabase for the backend, you must also set up secrets within Supabase for **Edge Functions**:
- Use the Supabase CLI:
  ```bash
  supabase secrets set GOOGLE_GEMINI_API_KEY=your_key_here
  supabase secrets set YOUTUBE_API_KEY=your_key_here
  ```
- Or use the Supabase Dashboard under **Project Settings > Edge Functions**.

## 5. Deployment Workflow
1. **Push to `main`**: Automatically deploys the production version to Vercel.
2. **Pull Requests**: Vercel creates a **Preview Deployment** for review before merging.
3. **Supabase Realtime**: Ensure your Vercel URL is added to the **CORS** whitelist in Supabase if needed (typically not for Supabase Realtime/API but better to verify).
