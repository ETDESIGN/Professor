# 04. Database Schema (Supabase/PostgreSQL)

## 1. User & Classroom Management

### `profiles`
- `id`: UUID (PK, references auth.users)
- `role`: `ENUM('teacher', 'student', 'parent')`
- `full_name`: TEXT
- `avatar_config`: JSONB (SVG layers and anchors)
- `xp_total`: INTEGER (DEFAULT 0)
- `coins`: INTEGER (DEFAULT 0)
- `streak_count`: INTEGER (DEFAULT 0)
- `last_activity_at`: TIMESTAMP

### `classes`
- `id`: UUID (PK)
- `teacher_id`: UUID (FK)
- `name`: TEXT
- `join_code`: TEXT (Unique, 6-character)
- `created_at`: TIMESTAMP

### `class_students`
- `class_id`: UUID (FK)
- `student_id`: UUID (FK)
- `joined_at`: TIMESTAMP

---

## 2. Curriculum & Orchestrator

### `courses`
- `id`: UUID (PK)
- `teacher_id`: UUID (FK)
- `title`: TEXT
- `description`: TEXT

### `units`
- `id`: UUID (PK)
- `course_id`: UUID (FK)
- `title`: TEXT
- `order_index`: INTEGER
- `is_published`: BOOLEAN (DEFAULT FALSE)

### `lessons`
- `id`: UUID (PK)
- `unit_id`: UUID (FK)
- `title`: TEXT
- `blueprint_json`: JSONB (The 6-step flow slides/steps)
- `metadata`: JSONB (Target vocabulary, grammar focus)

### `assets`
- `id`: UUID (PK)
- `owner_id`: UUID (FK, Teacher)
- `type`: `ENUM('image', 'video', 'audio', 'text')`
- `url`: TEXT
- `origin`: `ENUM('scan', 'web_search', 'ai_gen', 'upload')`
- `tags`: TEXT[] (Array of keywords)
- `refined_svg`: TEXT (Stored raw SVG data for avatars/icons)

---

## 3. Real-time Classroom Sessions

### `active_sessions`
- `id`: UUID (PK)
- `class_id`: UUID (FK)
- `lesson_id`: UUID (FK)
- `status`: `ENUM('waiting', 'live', 'finished')`
- `current_step_index`: INTEGER (Sync pointer)
- `display_state`: JSONB (e.g., `{ "wheel_active": true, "winner_id": "..." }`)

### `session_scores`
- `id`: UUID (PK)
- `session_id`: UUID (FK)
- `student_id`: UUID (FK)
- `points`: INTEGER
- `category`: `ENUM('participation', 'correct_answer', 'bonus')`
- `created_at`: TIMESTAMP

---

## 4. Student Progress & Inventory

### `assignments`
- `id`: UUID (PK)
- `lesson_id`: UUID (FK)
- `type`: `ENUM('dubbing', 'quiz', 'scramble', 'phonics')`
- `due_date`: TIMESTAMP

### `student_submissions`
- `id`: UUID (PK)
- `assignment_id`: UUID (FK)
- `student_id`: UUID (FK)
- `media_url`: TEXT
- `ai_score`: INTEGER
- `ai_feedback`: TEXT

### `shop_items`
- `id`: UUID (PK)
- `name`: TEXT
- `category`: `ENUM('hat', 'body', 'accessory', 'pet')`
- `cost`: INTEGER
- `asset_url`: TEXT
- `is_premium`: BOOLEAN (DEFAULT FALSE)

### `student_inventory`
- `student_id`: UUID (FK)
- `item_id`: UUID (FK)
- `acquired_at`: TIMESTAMP
