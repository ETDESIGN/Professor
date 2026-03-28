# Deep System Audit & Roadmap
*Lesson Orchestrator (Professor) EdTech SaaS*

This document provides a comprehensive architectural review of the Lesson Orchestrator MVP, focusing on the Authentication/Profile pipeline failures, persistent 404 errors, and UI/Database connectivity status.

---

## 1. Auth & Profile Pipeline Audit (CRITICAL)

### The Execution Path
The current flow from signup/login to the app state is:
1. `Login.tsx`: User submits form with email, password, and role. Calls `signUp` or `signInWithPassword` in `AuthService.ts`.
2. `AuthService.ts`: Calls `supabase.auth.signUp()` passing `role` and `full_name` in `user_metadata`.
3. **Database Trigger:** `handle_new_user()` executes on `auth.users` insert to create a row in `public.profiles`.
4. `AuthService.ts`: Extracts the profile data and returns it.
5. `App.tsx`: On mount, calls `getCurrentUser()` which fetches the user and profile.
6. `useAppStore.ts`: The profile is stored in Zustand (`userProfile` state).

### Root Causes of the 400 Error and Profile Registration Failure
There are three interconnected bugs causing the auth/profile pipeline to fail:

1. **The Trigger Data Type Mismatch (The 400 Error Cause):**
   In the database migration `20260321000002_bulletproof_auth_trigger.sql`, the `handle_new_user()` function was rewritten to prevent 500 errors. However, it attempts to insert the `role` from `raw_user_meta_data` as a plain `TEXT` string into the `public.profiles` table, where `role` is defined as a custom Enum (`user_role`). 
   Because of this implicit cast failure, the trigger silently swallows the error (due to the `EXCEPTION WHEN OTHERS` block), resulting in **no profile being created** when a user signs up. 
   When the user later tries to log in with `grant_type=password`, they might hit a 400 if the auth session state expects a valid profile that doesn't exist, or the frontend throws the "Profile setup incomplete" error because the lookup in `public.profiles` returns null.

2. **The Self-Healing Race Condition:**
   `AuthService.ts` contains a "Self-Healing" block in `signInWithPassword` that tries to manually insert a profile if one doesn't exist. However, the migration `20260324000000_profile_insert_policy.sql` only allows users to insert their own profile *if they are authenticated*. During sign-in, the session might not be fully established/propagated to the client before this insert fires, or it fires before RLS policies allow it, causing the self-healing to fail. Furthermore, the self-healing attempts to insert `role` as a string, hitting the same Enum casting issue as the trigger.

3. **Zustand Persistence Conflict:**
   In `useAppStore.ts`, `userProfile` is explicitly excluded from `persist` so it's fetched fresh on load. However, if the profile creation failed during signup, the fresh fetch on load returns null, causing `App.tsx` to boot the user back to `/login` despite a valid Supabase Auth session existing.

---

## 2. The 404 Ghost Audit

### The Source of the `login:1 Failed to load resource: 404`
The persistent 404 error on the login page (and other entry points) originates from the Progressive Web App (PWA) configuration in `vite.config.ts` combined with missing assets.

**Root Cause:**
In `vite.config.ts`, the `VitePWA` plugin is configured to include specific assets:
```typescript
includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
```
However, looking at the project directory (`public/`), these files **do not exist**. 
When the browser loads the HTML entry points (e.g., `index.html`), the Vite PWA plugin injects link tags for these missing icons. When the browser tries to fetch `http://localhost:3000/favicon.ico` or the manifest, it returns a 404 Not Found.

Furthermore, `index.html` (and the other entry points) use an `importmap` for React from `esm.sh`, but rely on local Vite entry points (`<script type="module" src="/studentEntry.tsx"></script>`). This mixing of external import maps and local module resolution can cause Vite's dev server to emit 404s for module paths it cannot resolve locally if not configured perfectly.

---

## 3. UI & DataService Connectivity Audit

### Fully Connected Features (Real Database)
1. **Teacher Classes & Students:** `TeacherDashboard.tsx` uses `getTeacherClasses` and `getClassStudents` from `DataService.ts`.
2. **Assignments:** `Assignments.tsx` and the `StudentApp` use `createAssignment`, `getClassAssignments`, and `getStudentAssignments`.
3. **Messaging:** `TeacherMessages.tsx` and `ParentMessages.tsx` are wired to `getUserMessages` and `sendMessage`.
4. **Session/Websockets:** True real-time connectivity exists in `SessionContext.tsx` via `supabase.channel('classroom_live')`.

### Disconnected / Mock Data Features (Action Required)
1. **Curriculum / Units State:** 
   In `store/useAppStore.ts`, the `units` array is initialized with hardcoded `MOCK_UNITS` and `MOCK_LESSON_FLOW` data ("Jungle Safari", "My Family"). Even though `SupabaseService.ts` has a `fetchUnits` function, when the app boots, the UI immediately renders this mock Zustand state. 
2. **Lesson Flow Defaults:**
   In `SessionContext.tsx`, `activeSlideData` defaults to `MOCK_LESSON_FLOW[0]`. If a unit has no generated flow, it silently falls back to the mock Jungle Safari lesson.
3. **Analytics/Reports:**
   In `DataService.ts`, `getClassAnalytics` deterministically generates mock skill data (`{ name: 'Listening', score: ... }`) instead of fetching real skill rubrics.
4. **Student App Maps/Practice:**
   The `StudentApp` hardcodes a mock playlist (`getLessonPlaylist`) if the active unit flow isn't loaded correctly, containing mock images and questions.

---

## 4. Actionable Roadmap

Here is the exact step-by-step execution plan required to fix the system:

### Phase 1: Fix Auth & Profile Pipeline (Priority 1)
1. **Fix the Database Trigger:**
   Modify `handle_new_user()` in SQL to explicitly cast the JSON metadata role to the `user_role` enum: `COALESCE(NEW.raw_user_meta_data->>'role', 'student')::public.user_role`.
2. **Fix the Self-Healing Mechanism:**
   In `AuthService.ts`, update the `insert` fallback in `signInWithPassword` to correctly cast the role. Ideally, rely solely on the fixed trigger and remove frontend self-healing to avoid RLS race conditions.
3. **Robust State Hydration:**
   Update `App.tsx` and `useAppStore.ts` to clear stale local storage automatically on auth mismatch, ensuring mock data artifacts don't trap the user in a "Profile setup incomplete" loop.

### Phase 2: Exorcise the 404 Ghosts
1. **Fix Vite PWA Config:**
   Update `vite.config.ts` to either remove the `VitePWA` plugin temporarily, or remove the `includeAssets` array until the actual icons (`favicon.ico`, `apple-touch-icon.png`) are generated and placed in the `/public` folder.
2. **Clean HTML Entry Points:**
   Review `index.html`, `teacher.html`, `student.html`, `parent.html`, and `admin.html`. Remove the explicit React `importmap` blocks if Vite is handling bundling locally—they are likely fighting Vite's internal module resolution.

### Phase 3: Purge Mock Data & Enforce True Connectivity
1. **Clear Zustand Defaults:**
   Remove `MOCK_UNITS` and `MOCK_LESSON_FLOW` from `useAppStore.ts`. Initialize `units: []`.
2. **Force Unit Fetch on Mount:**
   Ensure `TeacherDashboard` calls `Engine.fetchUnits()` on mount and populates Zustand, instead of relying on default state.
3. **Update Session Context:**
   Remove the fallback to `MOCK_LESSON_FLOW` in `SessionContext.tsx`. If a unit has no flow, it should explicitly render an empty state or generative UI, rather than the hardcoded safari lesson.
4. **Clean up `mockData.ts`:**
   Delete or strictly isolate `store/mockData.ts` to ensure components throw compile errors if they accidentally import static data instead of using `DataService.ts`.
