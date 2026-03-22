# Professor - Architecture & Technical Handoff Document

> **Last Updated:** 2026-03-22  
> **Version:** 0.1 (Production MVP)

---

## 1. System Architecture

### 1.1 Vite Multi-Page Application (MPA) Setup

This is a **Vite MPA** with 5 distinct portals:

| Entry Point | Portal | Route |
|-------------|--------|-------|
| `index.html` | Hub/Landing | `/` |
| `teacher.html` | Teacher Dashboard | `/teacher/*` |
| `student.html` | Student App | `/student/*` |
| `parent.html` | Parent Portal | `/parent/*` |
| `admin.html` | Admin Dashboard | `/admin/*` |

**Build Configuration** (`vite.config.ts`):
```typescript
build: {
  rollupOptions: {
    input: {
      main: path.resolve(__dirname, 'index.html'),
      teacher: path.resolve(__dirname, 'teacher.html'),
      student: path.resolve(__dirname, 'student.html'),
      parent: path.resolve(__dirname, 'parent.html'),
      admin: path.resolve(__dirname, 'admin.html'),
    }
  }
}
```

### 1.2 Vercel Routing (`vercel.json`)

Vercel handles routing using clean URLs and rewrites:

```json
{
  "framework": "vite",
  "cleanUrls": true,
  "rewrites": [
    { "source": "/teacher/:path*", "destination": "/teacher.html" },
    { "source": "/student/:path*", "destination": "/student.html" },
    { "source": "/parent/:path*", "destination": "/parent.html" },
    { "source": "/admin/:path*", "destination": "/admin.html" },
    { "source": "/:path*", "destination": "/index.html" }
  ]
}
```

### 1.3 State Management - Zustand

The app uses **Zustand** for global state management:

**Store Location:** `store/useAppStore.ts`

```typescript
interface AppState {
  units: LessonUnit[];
  students: any[];
  userProfile: AuthUser | null;
  setUserProfile: (profile: AuthUser) => void;
  // ... other state
}
```

**AuthUser Type** (`services/AuthService.ts`):
```typescript
export interface AuthUser {
  id: string;
  email: string;
  role: 'admin' | 'teacher' | 'student' | 'parent';
  full_name?: string;
  avatar_url?: string;
}
```

### 1.4 Styling

- **Tailwind CSS** with PostCSS build (not CDN)
- **Global styles** in `src/index.css`:
  - Custom 3D transforms
  - Custom scrollbars
  - Animation utilities

### 1.5 Key Dependencies

```json
{
  "@supabase/supabase-js": "^2.99.3",
  "react": "18.3.1",
  "react-router-dom": "^7.13.1",
  "zustand": "^5.0.12",
  "framer-motion": "^12.35.2",
  "lucide-react": "0.344.0"
}
```

---

## 2. Service Connections (The Runbook)

### 2.1 GitHub

- **Repository:** `ETDESIGN/Professor`
- **Branch:** `master`
- **Workflow:**
  1. Make changes locally
  2. Commit: `git commit -m "description"`
  3. Push: `git push origin master`
  4. Vercel auto-deploys on push

### 2.2 Vercel Deployment

**Environment Variables Required:**
| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL (e.g., `https://xxxxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `GEMINI_API_KEY` | Google Gemini API key for AI features |

**Deployment Trigger:**  
Automatic on push to `master` branch.

**Custom Domain:**  
Currently deployed at `professor-eta.vercel.app`

### 2.3 Supabase

**Project URL:** `https://xxxxx.supabase.co` (see `.env` file)

**Migration Files Location:** `supabase/migrations/`

| Migration | Description |
|-----------|-------------|
| `20260320000000_initial_schema.sql` | Units, students, student_progress, srs_items tables |
| `20260320000002_profiles_and_auth.sql` | Profiles table, auth trigger, RLS policies |
| `20260320000003_classes_and_enrollments.sql` | Classes, enrollments, parent links |
| `20260321000001_fix_rls_recursion.sql` | Fixed infinite RLS recursion |
| `20260321000002_bulletproof_auth_trigger.sql` | Bulletproof trigger with EXCEPTION handling |

**Apply Migrations:**
```bash
cd professor-0.1\ (1)
npx supabase db push
```

---

## 3. Database Schema & Security

### 3.1 Core Tables

#### `profiles` (Linked to auth.users)
```sql
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT,
  full_name TEXT,
  role user_role DEFAULT 'student',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `classes` (Teacher-owned classes)
```sql
CREATE TABLE public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  teacher_id UUID REFERENCES public.profiles(id),
  code TEXT UNIQUE,  -- For students to join
  is_active BOOLEAN DEFAULT true
);
```

#### `class_enrollments` (Student-Class links)
```sql
CREATE TABLE public.class_enrollments (
  id UUID PRIMARY KEY,
  class_id UUID REFERENCES public.classes(id),
  student_id UUID REFERENCES public.profiles(id),
  role_in_class TEXT DEFAULT 'student'
);
```

#### `student_progress`
```sql
CREATE TABLE public.student_progress (
  id UUID PRIMARY KEY,
  student_id TEXT UNIQUE,
  completed_unit_ids TEXT[],
  current_unit_id TEXT,
  xp INTEGER DEFAULT 0,
  streak INTEGER DEFAULT 0
);
```

#### `units` (Lesson units)
```sql
CREATE TABLE public.units (
  id UUID PRIMARY KEY,
  title TEXT,
  level TEXT,
  status TEXT CHECK (status IN ('Active', 'Draft', 'Locked', 'Completed', 'Processing')),
  flow JSONB DEFAULT '[]',
  scanned_assets JSONB DEFAULT '[]'
);
```

### 3.2 PostgreSQL Auth Trigger

**Critical Function:** `handle_new_user()`

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Unknown'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student')::user_role
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Profile creation failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

**Key Features:**
- Automatically creates profile on signup
- Uses `EXCEPTION WHEN OTHERS` to prevent 500 errors
- Logs failures instead of crashing

### 3.3 RLS Strategy

**IMPORTANT:** We experienced infinite recursion bugs. Current safe policies use:

1. **Strict `auth.role()` check:**
   ```sql
   USING (auth.role() = 'authenticated');
   ```

2. **Subquery with EXISTS (no recursion):**
   ```sql
   USING (
     EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid() AND p.role IN ('admin', 'teacher')
     )
   );
   ```

3. **NEVER use relational subqueries that reference the same table's RLS policy.**

---

## 4. Migration Timeline & Challenges Overcome

### 4.1 Phase 1: Mock → Real Data
- **Challenge:** MockEngine.ts had synchronous data that didn't persist
- **Solution:** Transitioned to async DataService.ts using Supabase

### 4.2 Phase 2: Math.random() Analytics
- **Challenge:** `apps/teacher/Reports.tsx` used `Math.random()` for fake analytics
- **Solution:** Replaced with real data queries from `student_progress` table

### 4.3 Phase 3: RLS Infinite Recursion
- **Challenge:** RLS policies queried the same table, causing infinite recursion
- **Solution:** Created `20260321000001_fix_rls_recursion.sql` using `auth.role()` instead of subqueries

### 4.4 Phase 4: Auth 500 Errors
- **Challenge:** Signup trigger failed on schema mismatch, causing 500 errors
- **Solution:** Created `20260321000002_bulletproof_auth_trigger.sql` with EXCEPTION handling

### 4.5 Phase 5: Email Confirmation Flow
- **Challenge:** UI threw "auto-login failed" when email confirmation required
- **Solution:** 
  - Added `emailRedirectTo: window.location.origin` for dynamic Vercel URLs
  - Added `needsEmailConfirmation` flag detection
  - Show friendly "Check your email" message

---

## 5. Immediate Next Steps (For the Next Agent)

### 5.1 Eradicate "Mrs. Travis" UI Bug

The UI may still be hardcoded to show mock profiles. Here's how to fix:

**Step 1: Verify AuthService returns full profile**

In `services/AuthService.ts`, ensure `getCurrentUser()` and `signInWithPassword()` return full_name and avatar_url:

```typescript
const { data: profile } = await supabase
  .from('profiles')
  .select('id, email, role, full_name, avatar_url')  // Include all fields
  .eq('id', user.id)
  .single();

return {
  id: profile.id,
  email: profile.email || '',
  role: profile.role as UserRole,
  full_name: profile.full_name || undefined,
  avatar_url: profile.avatar_url || undefined,
};
```

**Step 2: Update UI Headers**

In Teacher/Student/Parent dashboard components, use dynamic user data:

```typescript
const { userProfile } = useAppStore();

// Replace hardcoded names with:
{userProfile?.full_name || 'Loading...'}

// For avatars:
{userProfile?.avatar_url 
  ? <img src={userProfile.avatar_url} alt="Avatar" /> 
  : <span>{userProfile?.full_name?.[0] || '?'}</span>
}
```

**Step 3: Clear localStorage cache**

The Zustand store persists to localStorage. Clear it to force fresh data:

```javascript
// In browser console
localStorage.removeItem('app-storage');
```

### 5.2 Additional Improvements

1. **Add more RLS policies** for the `classes` and `class_enrollments` tables
2. **Implement real-time subscriptions** using Supabase Realtime
3. **Add unit tests** for critical auth flows
4. **Generate PWA icons** (currently disabled in vite.config.ts)

---

## 6. File Structure Reference

```
professor-0.1 (1)/
├── apps/                    # React app components
│   ├── teacher/            # Teacher dashboard components
│   ├── student/            # Student app components
│   ├── parent/             # Parent portal components
│   ├── admin/              # Admin dashboard
│   ├── board/              # Classroom board templates
│   └── remote/             # Teacher remote control
├── services/
│   ├── AuthService.ts      # Supabase auth functions
│   ├── supabaseClient.ts   # Supabase client init
│   └── MockEngine.ts       # Legacy mock (avoid using)
├── store/
│   ├── useAppStore.ts      # Zustand global store
│   └── SessionContext.tsx   # React context
├── supabase/
│   └── migrations/         # Database migrations
├── index.html              # Hub entry
├── teacher.html            # Teacher entry
├── student.html            # Student entry
├── parent.html             # Parent entry
├── admin.html              # Admin entry
├── vercel.json             # Vercel config
├── vite.config.ts          # Vite build config
└── tailwind.config.js      # Tailwind config
```

---

## 7. Troubleshooting

| Issue | Solution |
|-------|----------|
| "auto-login failed" after signup | Check Supabase email confirmation settings; ensure `emailRedirectTo` is set |
| RLS 500 errors | Check migration `20260321000001_fix_rls_recursion.sql` is applied |
| "Mrs. Travis" still showing | Clear localStorage, verify AuthService returns `full_name` |
| Build fails | Run `npx tsc --noEmit` to see errors |
| Supabase connection failed | Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` |

---

**End of Document**
