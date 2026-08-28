import { supabase } from './supabaseClient';

// ── Types (service-level contract, camelCase; DB is snake_case) ──────────────

export type DubbingClip = {
  id: string;
  classId: string;
  unitId: string | null;
  title: string;
  videoPath: string;
  videoDurationMs: number;
  language: string;
  status: 'draft' | 'assigned' | 'archived';
};

export type ClipLine = {
  id: string;
  order: number;
  text: string;
  startMs: number;
  endMs: number;
  characterName: string | null;
};

export type LineScore = {
  band: string;
  wordMatch: number;
  transcript: string;
  feedback: string;
  method: string;
};

export type Dubbing = {
  id: string;
  clipId: string;
  studentId: string;
  lineAudio: Record<string, string>;
  perLineScores: Record<string, LineScore>;
  overallBand: 'great' | 'almost' | 'try_again' | null;
  attemptNo: number;
  isPublished: boolean;
  createdAt: string;
};

export type Feedback = { stars: number; comment: string | null; createdAt: string };

const BUCKET = 'dubbing-media';

// ── Row mappers ──────────────────────────────────────────────────────────────

function mapClip(r: any): DubbingClip {
  return {
    id: r.id,
    classId: r.class_id,
    unitId: r.unit_id ?? null,
    title: r.title,
    videoPath: r.video_path,
    videoDurationMs: r.video_duration_ms,
    language: r.language,
    status: r.status,
  };
}

function mapLine(r: any): ClipLine {
  return {
    id: r.id,
    order: r.order,
    text: r.text,
    startMs: r.start_ms,
    endMs: r.end_ms,
    characterName: r.character_name ?? null,
  };
}

function mapDubbing(r: any): Dubbing {
  return {
    id: r.id,
    clipId: r.clip_id,
    studentId: r.student_id,
    lineAudio: r.line_audio ?? {},
    perLineScores: r.per_line_scores ?? {},
    overallBand: r.overall_band ?? null,
    attemptNo: r.attempt_no,
    isPublished: r.is_published ?? false,
    createdAt: r.created_at ?? '',
  };
}

// ── Pure helpers (exported for tests) ────────────────────────────────────────

/**
 * Validates line timing: lines must be ordered, non-overlapping, with
 * startMs < endMs. Throws Error('Lines overlap') on overlap/order violation
 * and Error('Line end must be after start') when endMs <= startMs.
 */
export function validateLines(
  lines: { startMs: number; endMs: number; order: number }[],
): void {
  const sorted = [...lines].sort((a, b) => a.order - b.order);
  for (const l of sorted) {
    if (l.endMs <= l.startMs) {
      throw new Error('Line end must be after start');
    }
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startMs < sorted[i - 1].endMs) {
      throw new Error('Lines overlap');
    }
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1)); // strip data: prefix
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function currentUid(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) throw new Error('Not authenticated');
  return data.user.id;
}

// ── Service ──────────────────────────────────────────────────────────────────

export const DubbingService = {
  /** Student: assigned clips of my classes (with lines). */
  async listMyClips(): Promise<(DubbingClip & { lines?: ClipLine[] })[]> {
    const uid = await currentUid();
    // class_enrollments/student enrollment via classes where I am a student
    const { data: classes, error: cErr } = await supabase
      .from('class_enrollments')
      .select('class_id')
      .eq('student_id', uid);
    if (cErr) throw new Error(cErr.message);
    const classIds = (classes ?? []).map((c: any) => c.class_id);
    if (classIds.length === 0) return [];
    const { data, error } = await supabase
      .from('dubbing_clips')
      .select('*')
      .in('class_id', classIds)
      .eq('status', 'assigned');
    if (error) throw new Error(error.message);
    const clips = (data ?? []).map(mapClip);
    if (clips.length === 0) return [];
    const { data: lines, error: lErr } = await supabase
      .from('dubbing_clip_lines')
      .select('*')
      .in('clip_id', clips.map((c) => c.id))
      .order('order', { ascending: true });
    if (lErr) throw new Error(lErr.message);
    const byClip = new Map<string, ClipLine[]>();
    for (const l of lines ?? []) {
      const arr = byClip.get(l.clip_id) ?? [];
      arr.push(mapLine(l));
      byClip.set(l.clip_id, arr);
    }
    return clips.map((c) => ({ ...c, lines: byClip.get(c.id) ?? [] }));
  },

  /** Lines of a clip, ordered by `order` ascending. */
  async getClipLines(clipId: string): Promise<ClipLine[]> {
    const { data, error } = await supabase
      .from('dubbing_clip_lines')
      .select('*')
      .eq('clip_id', clipId)
      .order('order', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapLine);
  },

  /** Single clip by id. Parent gallery path: parents get SELECT on dubbing_clips/lines
   *  when their child has ANY dub on the clip (20260828000004) — not gated on published. */
  async getClip(clipId: string): Promise<DubbingClip | null> {
    const { data, error } = await supabase
      .from('dubbing_clips')
      .select('*')
      .eq('id', clipId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapClip(data) : null;
  },

  /** Teacher: all clips of a class. */
  async listTeacherClips(classId: string): Promise<DubbingClip[]> {
    const { data, error } = await supabase
      .from('dubbing_clips')
      .select('*')
      .eq('class_id', classId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapClip);
  },

  /**
   * Upload with replace-on-duplicate semantics. NOTE: we deliberately do NOT
   * use storage upsert — an upsert requires a storage UPDATE policy, and the
   * dubbing-media bucket only has INSERT/SELECT/DELETE policies (an upsert
   * 403s with "new row violates row-level security policy"). Instead: plain
   * insert, and on a duplicate, delete the old object and insert again.
   */
  async uploadReplacing(path: string, body: Blob | File, contentType: string): Promise<void> {
    const up = async () => supabase.storage.from(BUCKET).upload(path, body, { contentType });
    let { error } = await up();
    if (error && /exists|duplicate|409/i.test(error.message)) {
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove([path]);
      if (rmErr) throw new Error(rmErr.message);
      ({ error } = await up());
    }
    if (error) throw new Error(error.message);
  },

  /** Creates a draft clip row; videoPath is generated here (source.<ext> from file ext is applied at upload). */
  async createClip(input: {
    classId: string;
    unitId?: string | null;
    title: string;
    videoDurationMs: number;
  }): Promise<{ id: string; videoPath: string }> {
    // created_by is NOT NULL with no DB default — stamp the signed-in teacher.
    const { data: userData } = await supabase.auth.getUser();
    const createdBy = userData.user?.id;
    if (!createdBy) throw new Error('Not signed in');
    const { data, error } = await supabase
      .from('dubbing_clips')
      .insert({
        class_id: input.classId,
        unit_id: input.unitId ?? null,
        title: input.title,
        video_duration_ms: input.videoDurationMs,
        // video_path is NOT NULL — stamp a placeholder in the INSERT itself
        // (the real path needs the generated id and is set in the update below).
        video_path: 'pending',
        created_by: createdBy,
        status: 'draft',
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    const videoPath = `clips/${data.id}/source.webm`;
    const { error: uErr } = await supabase
      .from('dubbing_clips')
      .update({ video_path: videoPath })
      .eq('id', data.id);
    if (uErr) throw new Error(uErr.message);
    return { id: data.id, videoPath };
  },

  /** Uploads the source video to the private bucket and stamps video_path. Validates ≤60s and ≤50MB client-side. */
  async uploadClipVideo(clipId: string, file: File): Promise<void> {
    if (file.size > 50 * 1024 * 1024) throw new Error('Video exceeds 50MB limit');
    const { data: clip } = await supabase
      .from('dubbing_clips')
      .select('video_duration_ms')
      .eq('id', clipId)
      .single();
    if (clip && clip.video_duration_ms > 60_000) {
      throw new Error('Video exceeds 60s limit');
    }
    const ext = (file.name.split('.').pop() || 'webm').toLowerCase();
    const path = `clips/${clipId}/source.${ext}`;
    await DubbingService.uploadReplacing(path, file, file.type || 'video/webm');
    const { error: uErr } = await supabase
      .from('dubbing_clips')
      .update({ video_path: path })
      .eq('id', clipId);
    if (uErr) throw new Error(uErr.message);
  },

  /** Replaces all lines of a clip: validate, delete all, insert ordered. */
  async saveClipLines(clipId: string, lines: Omit<ClipLine, 'id'>[]): Promise<void> {
    validateLines(lines);
    const { error: dErr } = await supabase
      .from('dubbing_clip_lines')
      .delete()
      .eq('clip_id', clipId);
    if (dErr) throw new Error(dErr.message);
    const rows = lines.map((l) => ({
      clip_id: clipId,
      order: l.order,
      text: l.text,
      start_ms: l.startMs,
      end_ms: l.endMs,
      character_name: l.characterName,
    }));
    if (rows.length === 0) return;
    const { error } = await supabase.from('dubbing_clip_lines').insert(rows);
    if (error) throw new Error(error.message);
  },

  async assignClip(clipId: string): Promise<void> {
    const { error } = await supabase
      .from('dubbing_clips')
      .update({ status: 'assigned' })
      .eq('id', clipId)
      .eq('status', 'draft');
    if (error) throw new Error(error.message);
  },

  async archiveClip(clipId: string): Promise<void> {
    const { error } = await supabase
      .from('dubbing_clips')
      .update({ status: 'archived' })
      .eq('id', clipId);
    if (error) throw new Error(error.message);
  },

  /** Uploads one recorded line; returns the storage path. */
  async uploadLineAudio(dubbingId: string, lineId: string, blob: Blob): Promise<string> {
    const uid = await currentUid();
    const path = `dubs/${uid}/${dubbingId}/${lineId}.webm`;
    await DubbingService.uploadReplacing(path, blob, 'audio/webm');
    return path;
  },

  async createDubbing(clipId: string, attemptNo: number): Promise<string> {
    const uid = await currentUid();
    const { data, error } = await supabase
      .from('dubbings')
      .insert({ clip_id: clipId, student_id: uid, attempt_no: attemptNo, is_published: false })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return data.id;
  },

  async saveTake(input: {
    dubbingId: string;
    lineAudio: Record<string, string>;
    perLineScores: Record<string, LineScore>;
    overallBand: string;
  }): Promise<void> {
    const { error } = await supabase
      .from('dubbings')
      .update({
        line_audio: input.lineAudio,
        per_line_scores: input.perLineScores,
        overall_band: input.overallBand,
      })
      .eq('id', input.dubbingId);
    if (error) throw new Error(error.message);
  },

  /**
   * Publishes a take. First unpublishes the caller's other published take for
   * the same clip (is_published=false, published_at=null), then publishes this
   * one. Note: the DB trigger `dubbing_teacher_update_guard` restricts teacher
   * updates to unpublish-only; student updates of own rows are unrestricted —
   * this path is student-side.
   */
  async publishDubbing(dubbingId: string): Promise<void> {
    const uid = await currentUid();
    const { data: d } = await supabase
      .from('dubbings')
      .select('clip_id')
      .eq('id', dubbingId)
      .single();
    if (!d) throw new Error('Dubbing not found');
    // 1) unpublish my other published take for this clip
    const { error: unErr } = await supabase
      .from('dubbings')
      .update({ is_published: false, published_at: null })
      .eq('clip_id', d.clip_id)
      .eq('student_id', uid)
      .eq('is_published', true)
      .neq('id', dubbingId);
    if (unErr) throw new Error(unErr.message);
    // 2) publish this take
    const { error } = await supabase
      .from('dubbings')
      .update({ is_published: true, published_at: new Date().toISOString() })
      .eq('id', dubbingId);
    if (error) throw new Error(error.message);
  },

  /**
   * Teacher moderation: unpublish a dub. Plain update — teacher scope
   * (unpublish-only columns) is enforced by the `dubbing_teacher_update_guard`
   * DB trigger + RLS, not here.
   */
  async unpublishDubbing(dubbingId: string): Promise<void> {
    const { error } = await supabase
      .from('dubbings')
      .update({ is_published: false, published_at: null })
      .eq('id', dubbingId);
    if (error) throw new Error(error.message);
  },

  /** Student gallery: published dubs for a clip, with author name, like count, likedByMe. */
  async listClassDubs(
    clipId: string,
  ): Promise<(Dubbing & { studentName: string; likeCount: number; likedByMe: boolean })[]> {
    const uid = await currentUid();
    const { data, error } = await supabase
      .from('dubbings')
      .select('*, student:profiles!dubbings_student_id_fkey(full_name), dubbing_likes(dubbing_id, student_id)')
      .eq('clip_id', clipId)
      .eq('is_published', true)
      .order('published_at', { ascending: false });
    if (error) throw new Error(error.message);
    // Classmate first names via the scoped SECURITY DEFINER RPC — students
    // cannot read other students' profiles rows under RLS, so the embed
    // above returns null for them (privacy: FIRST NAME ONLY via the RPC;
    // the embed fallback only ever resolves for teacher/admin contexts).
    const { data: names } = await supabase.rpc('dubbing_classmate_first_names', { p_clip: clipId });
    const firstNameByStudent = new Map<string, string>(
      (names ?? []).map((n: any) => [n.student_id as string, (n.first_name ?? '') as string]),
    );
    return (data ?? []).map((r: any) => {
      const likes: any[] = r.dubbing_likes ?? [];
      return {
        ...mapDubbing(r),
        studentName: firstNameByStudent.get(r.student_id) ?? r.student?.full_name ?? '',
        likeCount: likes.length,
        likedByMe: likes.some((l) => l.student_id === uid),
      };
    });
  },

  async myDubs(clipId?: string): Promise<Dubbing[]> {
    const uid = await currentUid();
    let q = supabase.from('dubbings').select('*').eq('student_id', uid);
    if (clipId) q = q.eq('clip_id', clipId);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapDubbing);
  },

  /** Parent: all dubs of my child. */
  async childDubs(childId: string): Promise<Dubbing[]> {
    const { data, error } = await supabase
      .from('dubbings')
      .select('*')
      .eq('student_id', childId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapDubbing);
  },

  /** Deletes the storage blobs referenced by lineAudio BEFORE the row (parent erasure path). */
  async deleteDubbing(dubbingId: string): Promise<void> {
    const { data: d, error } = await supabase
      .from('dubbings')
      .select('line_audio')
      .eq('id', dubbingId)
      .single();
    if (error) throw new Error(error.message);
    const paths = Object.values((d?.line_audio ?? {}) as Record<string, string>);
    if (paths.length > 0) {
      const { error: rErr } = await supabase.storage.from(BUCKET).remove(paths);
      if (rErr) throw new Error(rErr.message);
    }
    const { error: dErr } = await supabase.from('dubbings').delete().eq('id', dubbingId);
    if (dErr) throw new Error(dErr.message);
  },

  async toggleLike(dubbingId: string): Promise<void> {
    const uid = await currentUid();
    const { data: existing, error } = await supabase
      .from('dubbing_likes')
      .select('dubbing_id')
      .eq('dubbing_id', dubbingId)
      .eq('student_id', uid)
      .limit(1);
    if (error) throw new Error(error.message);
    if (existing && existing.length > 0) {
      const { error: dErr } = await supabase
        .from('dubbing_likes')
        .delete()
        .eq('dubbing_id', dubbingId)
        .eq('student_id', uid);
      if (dErr) throw new Error(dErr.message);
    } else {
      const { error: iErr } = await supabase
        .from('dubbing_likes')
        .insert({ dubbing_id: dubbingId, student_id: uid });
      if (iErr) throw new Error(iErr.message);
    }
  },

  /** Teacher: leave star feedback on a dub. */
  async addFeedback(dubbingId: string, stars: 1 | 2 | 3, comment?: string): Promise<void> {
    const uid = await currentUid();
    const { error } = await supabase.from('dubbing_feedback').insert({
      dubbing_id: dubbingId,
      teacher_id: uid,
      stars,
      comment: comment ?? null,
    });
    if (error) throw new Error(error.message);
  },

  async listFeedback(dubbingId: string): Promise<Feedback[]> {
    const { data, error } = await supabase
      .from('dubbing_feedback')
      .select('stars, comment, created_at')
      .eq('dubbing_id', dubbingId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      stars: r.stars,
      comment: r.comment ?? null,
      createdAt: r.created_at,
    }));
  },

  /** Teacher review: ALL takes in my class for a clip. */
  async listClassDubEntries(clipId: string): Promise<(Dubbing & { studentName: string })[]> {
    const { data, error } = await supabase
      .from('dubbings')
      .select('*, student:profiles!dubbings_student_id_fkey(full_name)')
      .eq('clip_id', clipId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      ...mapDubbing(r),
      studentName: r.student?.full_name ?? '',
    }));
  },

  async signedUrl(path: string): Promise<string> {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
    if (error) throw new Error(error.message);
    return data.signedUrl;
  },

  /**
   * Invokes the `evaluate-dubbing` edge function.
   * NOTE: keep per-request line counts SMALL (≤6 lines) per the Task 3 review;
   * this function passes the caller's lines array through as-is — callers are
   * responsible for chunking (done in Task 8).
   */
  async evaluateTake(
    _clipId: string,
    lines: { lineId: string; text: string; transcript?: string; audioBase64?: string }[],
  ): Promise<{ results: Record<string, LineScore>; overallBand: string }> {
    const { data, error } = await supabase.functions.invoke('evaluate-dubbing', {
      body: { lines },
    });
    if (error) throw new Error(error.message);
    if (!data?.success) throw new Error(data?.error ?? 'evaluate-dubbing failed');
    return { results: data.results ?? {}, overallBand: data.overallBand };
  },
};
