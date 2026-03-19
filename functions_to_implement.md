# Functions to Implement (Audit & Roadmap)

This document tracks the core features and systems required to complete the Lesson Orchestrator product, based on the deep audit of the current UI and system functionality.

## 1. Student App (At-Home Experience)
The core asynchronous learning loop.

*   **Dynamic Curriculum Map (`HomeMap.tsx`)**: Connect the hardcoded map nodes to a database so the map dynamically generates based on the student's assigned curriculum, tracking which units are locked, active, and completed.
*   **Lesson Engine (`LessonSession.tsx`)**: Build out the actual JSON schema for lessons so the engine can parse real data instead of mock data. This includes handling different question types (multiple choice, fill-in-the-blank, matching).
*   **Spaced Repetition System (SRS) Backend**: Implement the backend algorithm (like SuperMemo-2) that tracks how well a student remembers a word (Hard, Good, Easy) and schedules it for review at the optimal time. (UI `SpacedRepetition.tsx` is implemented).
*   **Daily Quests & Streaks**: Backend logic to track daily logins, calculate streaks, and award XP/Gems when quests are completed.
*   **Economy & Shop (`Shop.tsx`)**: Connect the shop to the user's real Gem balance. Allow purchasing of streak freezes, avatar outfits, or profile banners, and deduct the currency accordingly.
*   **Leaderboard (`Leaderboard.tsx`)**: Implement a real-time ranking system (e.g., Bronze, Silver, Gold leagues) based on weekly XP earned, fetching data from other real students in their cohort.
*   **Pronunciation Coach**: Needs integration with a real Speech-to-Text API (like Google Cloud Speech-to-Text or browser native) to actually listen to the student and grade their pronunciation.
*   **Dubbing Studio**: Needs a system to load short video clips, mute the original dialogue, record the student's voice over it, and play it back.
*   **Phonics Fly / Reading Reader**: Needs real content libraries and progression logic.

## 2. Teacher Studio & Admin Setup (Content Creation & Management)
Tools for teachers and admins to create and manage content.

*   **AI Content Generation & Review UI**:
    *   **Textbook/Material Scanner**: A UI where a teacher uploads a PDF or image of a textbook page.
    *   **AI Extraction Review**: A "Review & Edit" screen to approve, modify, or delete the AI's suggestions (vocabulary, grammar points, generated sentences) before they are published to the student's curriculum map.
    *   **Audio Generation**: A tool to automatically generate Text-to-Speech (TTS) audio for the extracted vocabulary and sentences, allowing the teacher to preview and regenerate if needed.
*   **Class & Roster Management**:
    *   **Class Creation**: A screen for teachers to create a new class (e.g., "3rd Grade English").
    *   **Student Onboarding**: A system to add students to a class and generate their login credentials.
    *   **QR Code Passports**: Generate printable QR Code Passports for younger kids to log in instantly (bypassing email/password).
*   **Analytics & Reporting**:
    *   **Teacher Dashboard**: A high-level view showing which students are completing their at-home assignments, who is on a streak, and who is falling behind.
    *   **Struggle Areas**: An analytics view that aggregates SRS data to show the teacher which specific words or grammar rules the class is struggling with the most, so they can address it in the next live projector session.

## 3. Parent Portal (Visibility & Engagement)
*   **Parent Dashboard**: A read-only web view (or email report system) where parents can see their child's progress, time spent learning, and recent achievements.
*   **Account Linking**: A setup flow to securely link a parent's email to a student's account.

## 4. System & Infrastructure (The Foundation)
*   **Database Integration (Supabase/Firebase)**: Replace all `MockEngine.ts` calls with real database queries. Create tables for `Users`, `Classes`, `Units`, `Lessons`, `UserProgress`, and `SRS_Items`.
*   **Authentication**: Implement secure login (Role-based: SuperAdmin, Teacher, Student, Parent).
*   **Offline-First Architecture**: Implement a Service Worker to cache audio files, images, and the next few lessons so students can play on the bus or without a stable internet connection, syncing their XP when they reconnect.
