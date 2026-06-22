// SupabaseService.ts — Data persistence layer using Supabase

import { supabase } from './supabaseClient';
import { LessonManifest } from '../types/pipeline';
import { transformManifestToFlow } from './LessonTransformer';
import { createClientLogger } from './logger';
import { diffMissingSRSWords, SRS_DEFAULTS } from './srs';

const log = createClientLogger('SupabaseService');

// Re-export types so consumers can keep their imports
export interface ScannedAsset {
    id: string;
    type: 'vocab' | 'grammar' | 'image' | 'text';
    content: any;
    status: 'pending' | 'approved' | 'rejected';
}

export interface LessonUnit {
    id: string;
    title: string;
    level: string;
    status: 'Active' | 'Draft' | 'Locked' | 'Completed' | 'Processing';
    lessons: number;
    coverImage: string;
    lastUpdated?: string;
    flow: any[];
    scannedAssets: ScannedAsset[];
    manifest?: LessonManifest;
    topic?: string;
}

const requireSupabase = (): void => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    if (!url || url.length === 0) {
        throw new Error('Database not configured. Please set VITE_SUPABASE_URL in your environment.');
    }
};

// ------------------------------------------------------------------
// Supabase-backed implementations
// ------------------------------------------------------------------

const supabaseFetchUnits = async (): Promise<LessonUnit[]> => {
    try {
        const { data, error } = await supabase
            .from('units')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            log.warn('error_fetching_units', { error: error.message });
            return [];
        }

        return (data || []).map(row => ({
            id: row.id,
            title: row.title,
            level: row.level,
            status: row.status,
            lessons: row.lessons ?? 0,
            coverImage: row.cover_image ?? '',
            lastUpdated: row.last_updated,
            flow: row.flow ?? [],
            scannedAssets: row.scanned_assets ?? [],
            manifest: row.manifest ?? undefined,
            topic: row.topic ?? undefined,
        }));
    } catch (err) {
        log.warn('unexpected_error_fetching_units', { error: err instanceof Error ? err.message : String(err) });
        return [];
    }
};

const supabaseCreateUnit = async (title: string, manifest?: LessonManifest): Promise<LessonUnit> => {
    let generatedFlow: any[] = [];
    if (manifest) {
        generatedFlow = await transformManifestToFlow(manifest);
    }

    const { data: { user } } = await supabase.auth.getUser();

    const row: any = {
        title: manifest?.meta.unit_title || title,
        level: manifest?.meta.difficulty_cefr || 'Draft',
        status: 'Processing',
        lessons: manifest?.timeline?.length || 0,
        cover_image: manifest?.meta.theme
            ? `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(manifest.meta.theme)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5be`
            : `https://api.dicebear.com/7.x/shapes/svg?seed=${Date.now()}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5be`,
        flow: generatedFlow,
        scanned_assets: [],
        manifest: manifest ?? null,
        topic: manifest?.meta.theme || 'General',
    };

    if (user) {
        row.teacher_id = user.id;
    }

    const { data, error } = await supabase.from('units').insert(row).select().single();
    if (error) throw error;

    return {
        id: data.id,
        title: data.title,
        level: data.level,
        status: data.status,
        lessons: data.lessons,
        coverImage: data.cover_image,
        lastUpdated: data.last_updated,
        flow: data.flow ?? [],
        scannedAssets: data.scanned_assets ?? [],
        manifest: data.manifest ?? undefined,
        topic: data.topic ?? undefined,
    };
};

const supabaseGetUnitById = async (id: string): Promise<LessonUnit | undefined> => {
    const { data, error } = await supabase.from('units').select('*').eq('id', id).single();
    if (error || !data) return undefined;

    return {
        id: data.id,
        title: data.title,
        level: data.level,
        status: data.status,
        lessons: data.lessons,
        coverImage: data.cover_image,
        lastUpdated: data.last_updated,
        flow: data.flow ?? [],
        scannedAssets: data.scanned_assets ?? [],
        manifest: data.manifest ?? undefined,
        topic: data.topic ?? undefined,
    };
};

const supabaseUpdateUnit = async (id: string, updates: Partial<LessonUnit>): Promise<void> => {
    const row: any = {};
    if (updates.title !== undefined) row.title = updates.title;
    if (updates.level !== undefined) row.level = updates.level;
    if (updates.status !== undefined) row.status = updates.status;
    if (updates.lessons !== undefined) row.lessons = updates.lessons;
    if (updates.coverImage !== undefined) row.cover_image = updates.coverImage;
    if (updates.topic !== undefined) row.topic = updates.topic;
    if (updates.scannedAssets !== undefined) row.scanned_assets = updates.scannedAssets;

    if (updates.manifest) {
        row.manifest = updates.manifest;
        row.flow = await transformManifestToFlow(updates.manifest);
    } else if (updates.flow !== undefined) {
        row.flow = updates.flow;
    }

    row.last_updated = new Date().toISOString();

    const { error } = await supabase.from('units').update(row).eq('id', id);
    if (error) throw error;
};

const supabaseUnlockNextUnit = async (currentId: string): Promise<void> => {
    const { error: completeError } = await supabase.from('units').update({ status: 'Completed' }).eq('id', currentId);
    if (completeError) {
        log.warn('unlock_complete_unit_failed', { error: completeError.message });
        throw completeError;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        log.warn('no_authenticated_user', { metadata: { context: 'unlockNextUnit' } });
        return;
    }

    const { data: progress } = await supabase
        .from('student_progress')
        .select('*')
        .eq('student_id', user.id)
        .single();

    if (progress) {
        const completedIds: string[] = progress.completed_unit_ids || [];
        if (!completedIds.includes(currentId)) {
            completedIds.push(currentId);
        }
        const { error: progressError } = await supabase.from('student_progress').update({
            completed_unit_ids: completedIds,
        }).eq('student_id', user.id);
        if (progressError) {
            log.warn('unlock_progress_update_failed', { error: progressError.message });
        }
    }

    const { data: currentUnitData } = await supabase
        .from('units')
        .select('created_at')
        .eq('id', currentId)
        .single();

    if (!currentUnitData) return;

    const { data: nextUnit } = await supabase
        .from('units')
        .select('id, status')
        .gt('created_at', currentUnitData.created_at)
        .eq('status', 'Locked')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

    if (nextUnit) {
        const { error: unlockError } = await supabase.from('units').update({ status: 'Active' }).eq('id', nextUnit.id);
        if (unlockError) {
            log.warn('unlock_next_unit_failed', { error: unlockError.message });
        }
    }
};

const supabaseGetStudentProgress = async () => {
    // Get authenticated user ID
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        log.warn('no_authenticated_user', { metadata: { context: 'getStudentProgress' } });
        return { completedUnitIds: [], currentUnitId: '', xp: 0, streak: 0 };
    }

    const { data, error } = await supabase
        .from('student_progress')
        .select('*')
        .eq('student_id', user.id)
        .single();

    if (error || !data) {
        return { completedUnitIds: [], currentUnitId: '', xp: 0, streak: 0 };
    }

    return {
        completedUnitIds: data.completed_unit_ids || [],
        currentUnitId: data.current_unit_id || '',
        xp: data.xp ?? 0,
        streak: data.streak ?? 0,
    };
};

const supabaseUpdateStudentProgress = async (updates: any) => {
    // Get authenticated user ID
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        log.warn('no_authenticated_user', { metadata: { context: 'updateStudentProgress' } });
        return updates;
    }

    const row: any = {};
    if (updates.xp !== undefined) row.xp = updates.xp;
    if (updates.streak !== undefined) row.streak = updates.streak;
    if (updates.completedUnitIds !== undefined) row.completed_unit_ids = updates.completedUnitIds;
    if (updates.currentUnitId !== undefined) row.current_unit_id = updates.currentUnitId;

    const { error: progressError } = await supabase.from('student_progress').update(row).eq('student_id', user.id);
    if (progressError) {
        log.warn('student_progress_update_failed', { error: progressError.message });
    }

    return { ...updates };
};

const supabaseFetchSRSItems = async (studentId?: string) => {
    let effectiveId = studentId;
    if (!effectiveId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            log.warn('no_authenticated_user', { metadata: { context: 'fetchSRSItems' } });
            return [];
        }
        effectiveId = user.id;
    }

    const { data, error } = await supabase
        .from('srs_items')
        .select('*')
        .eq('student_id', effectiveId)
        .lte('next_review', new Date().toISOString());

    if (error || !data || data.length === 0) {
        const { data: allData } = await supabase
            .from('srs_items')
            .select('*')
            .eq('student_id', effectiveId)
            .order('next_review', { ascending: true })
            .limit(10);
        return allData || [];
    }
    return data;
};

const supabaseUpdateSRSItem = async (id: string, quality: number) => {
    const { data: item } = await supabase.from('srs_items').select('*').eq('id', id).single();
    if (!item) return;

    let { interval, repetition, efactor } = item;

    if (quality >= 3) {
        if (repetition === 0) interval = 1;
        else if (repetition === 1) interval = 6;
        else interval = Math.round(interval * efactor);
        repetition += 1;
    } else {
        repetition = 0;
        interval = 1;
    }

    efactor = efactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (efactor < 1.3) efactor = 1.3;

    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + interval);

    const { error: srsError } = await supabase.from('srs_items').update({
        interval, repetition, efactor,
        next_review: nextReview.toISOString(),
    }).eq('id', id);
    if (srsError) {
        log.warn('srs_item_update_failed', { error: srsError.message });
    }
};

const supabaseEnsureStudentSRSItems = async (unitId: string, studentId: string): Promise<void> => {
    // Phase 3 (P0-3): RECONCILE the student's deck against the unit's templates.
    // Previously this cloned only when the student had ZERO items, so a teacher
    // re-orchestrating a unit (adding/changing vocab) never reached students who
    // had already started. Now we add only the MISSING words, preserving each
    // existing item's SM-2 state. Non-destructive (never deletes or resets).
    const { data: templates, error: tErr } = await supabase
        .from('srs_items')
        .select('word, translation')
        .is('student_id', null)
        .eq('unit_id', unitId);

    if (tErr) {
        log.warn('srs_templates_fetch_failed', { error: tErr.message });
        return;
    }
    if (!templates || templates.length === 0) return;

    const { data: existing } = await supabase
        .from('srs_items')
        .select('word')
        .eq('student_id', studentId)
        .eq('unit_id', unitId);

    const toClone = diffMissingSRSWords(templates as { word: string }[], (existing || []) as { word: string }[]);
    if (toClone.length === 0) return; // already in sync

    const clones = toClone.map((t) => ({
        unit_id: unitId,
        student_id: studentId,
        word: t.word,
        translation: (templates as any[]).find((tp) => tp.word === t.word)?.translation ?? '',
        ...SRS_DEFAULTS,
        next_review: new Date().toISOString(),
    }));

    const { error: cloneError } = await supabase.from('srs_items').insert(clones);
    if (cloneError) {
        log.warn('srs_items_clone_failed', { error: cloneError.message });
    }
};

// ------------------------------------------------------------------
// Unified Engine — delegates to Supabase
// ------------------------------------------------------------------

export const Engine = {
    fetchUnits: async (): Promise<LessonUnit[]> => {
        requireSupabase();
        return supabaseFetchUnits();
    },

    createUnit: async (title: string, manifest?: LessonManifest): Promise<LessonUnit> => {
        requireSupabase();
        return supabaseCreateUnit(title, manifest);
    },

    getUnitById: async (id: string): Promise<LessonUnit | undefined> => {
        requireSupabase();
        return supabaseGetUnitById(id);
    },

    updateUnit: async (id: string, updates: Partial<LessonUnit>): Promise<void> => {
        requireSupabase();
        return supabaseUpdateUnit(id, updates);
    },

    unlockNextUnit: async (currentId: string): Promise<void> => {
        requireSupabase();
        return supabaseUnlockNextUnit(currentId);
    },

    getStudentProgress: async () => {
        requireSupabase();
        return supabaseGetStudentProgress();
    },

    updateStudentProgress: async (updates: any) => {
        requireSupabase();
        return supabaseUpdateStudentProgress(updates);
    },

    fetchSRSItems: async (studentId?: string) => {
        requireSupabase();
        return supabaseFetchSRSItems(studentId);
    },

    updateSRSItem: async (id: string, quality: number) => {
        requireSupabase();
        return supabaseUpdateSRSItem(id, quality);
    },

    ensureStudentSRSItems: async (unitId: string, studentId: string): Promise<void> => {
        requireSupabase();
        return supabaseEnsureStudentSRSItems(unitId, studentId);
    },

    simulateScan: async (fileName: string): Promise<LessonUnit> => {
        requireSupabase();
        return supabaseCreateUnit(fileName);
    },

    generateMockLessonData: (fileName: string) => {
        return { title: fileName, vocab: [] };
    },
};
