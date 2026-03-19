// SupabaseService.ts — Drop-in replacement for MockEngine
// Uses Supabase for all data persistence. Falls back to MockEngine locally
// if Supabase env vars are not configured (for local dev without a DB).

import { supabase } from './supabaseClient';
import { LessonManifest } from './geminiService';
import { transformManifestToFlow } from './LessonTransformer';

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

// Helper: check if Supabase is configured
const isSupabaseConfigured = (): boolean => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    return Boolean(url && url.length > 0);
};

// ------------------------------------------------------------------
// If Supabase is not configured, delegate to MockEngine at runtime.
// This lets the app work in pure-frontend/dev mode seamlessly.
// ------------------------------------------------------------------

const getMockEngine = async () => {
    const mod = await import('./MockEngine');
    return mod.MockEngine;
};

// ------------------------------------------------------------------
// Supabase-backed implementations
// ------------------------------------------------------------------

const supabaseFetchUnits = async (): Promise<LessonUnit[]> => {
    const { data, error } = await supabase
        .from('units')
        .select('*')
        .order('last_updated', { ascending: false });

    if (error) throw error;

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
};

const supabaseCreateUnit = async (title: string, manifest?: LessonManifest): Promise<LessonUnit> => {
    let generatedFlow: any[] = [];
    if (manifest) {
        generatedFlow = await transformManifestToFlow(manifest);
    }

    const row = {
        title: manifest?.meta.unit_title || title,
        level: manifest?.meta.difficulty_cefr || 'Draft',
        status: 'Processing',
        lessons: manifest?.timeline.length || 0,
        cover_image: `https://api.dicebear.com/7.x/shapes/svg?seed=${Date.now()}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5be`,
        flow: generatedFlow,
        scanned_assets: [],
        manifest: manifest ?? null,
        topic: manifest?.meta.theme || 'General',
    };

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
    // Mark current unit as Completed
    await supabase.from('units').update({ status: 'Completed' }).eq('id', currentId);

    // Update student progress
    const { data: progress } = await supabase
        .from('student_progress')
        .select('*')
        .eq('student_id', 'default_student')
        .single();

    if (progress) {
        const completedIds: string[] = progress.completed_unit_ids || [];
        if (!completedIds.includes(currentId)) {
            completedIds.push(currentId);
        }
        await supabase.from('student_progress').update({
            completed_unit_ids: completedIds,
        }).eq('student_id', 'default_student');
    }

    // Find and unlock the next unit (by position in the database)
    const { data: allUnits } = await supabase
        .from('units')
        .select('id, status')
        .order('last_updated', { ascending: true });

    if (allUnits) {
        const idx = allUnits.findIndex(u => u.id === currentId);
        if (idx !== -1 && idx < allUnits.length - 1) {
            const nextUnit = allUnits[idx + 1];
            if (nextUnit.status === 'Locked') {
                await supabase.from('units').update({ status: 'Active' }).eq('id', nextUnit.id);
            }
        }
    }
};

const supabaseGetStudentProgress = async () => {
    const { data, error } = await supabase
        .from('student_progress')
        .select('*')
        .eq('student_id', 'default_student')
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
    const row: any = {};
    if (updates.xp !== undefined) row.xp = updates.xp;
    if (updates.streak !== undefined) row.streak = updates.streak;
    if (updates.completedUnitIds !== undefined) row.completed_unit_ids = updates.completedUnitIds;
    if (updates.currentUnitId !== undefined) row.current_unit_id = updates.currentUnitId;

    await supabase.from('student_progress').update(row).eq('student_id', 'default_student');

    return { ...updates };
};

const supabaseFetchStudents = async () => {
    const { data, error } = await supabase.from('students').select('*');
    if (error || !data || data.length === 0) {
        // Fallback to mock data
        const { MOCK_STUDENTS } = await import('../store/mockData');
        return MOCK_STUDENTS;
    }
    return data;
};

const supabaseAddStudent = async (student: any) => {
    const { data, error } = await supabase.from('students').insert(student).select().single();
    if (error) throw error;
    return data;
};

const supabaseRemoveStudent = async (id: string) => {
    await supabase.from('students').delete().eq('id', id);
};

const supabaseFetchSRSItems = async (studentId: string = 'default_student') => {
    const { data, error } = await supabase
        .from('srs_items')
        .select('*')
        .eq('student_id', studentId)
        .lte('next_review', new Date().toISOString());

    if (error || !data) return [];
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

    await supabase.from('srs_items').update({
        interval, repetition, efactor,
        next_review: nextReview.toISOString(),
    }).eq('id', id);
};

// ------------------------------------------------------------------
// Unified Engine — delegates to Supabase or MockEngine
// ------------------------------------------------------------------

export const Engine = {
    fetchUnits: async (): Promise<LessonUnit[]> => {
        if (isSupabaseConfigured()) return supabaseFetchUnits();
        return (await getMockEngine()).fetchUnits();
    },

    createUnit: async (title: string, manifest?: LessonManifest): Promise<LessonUnit> => {
        if (isSupabaseConfigured()) return supabaseCreateUnit(title, manifest);
        return (await getMockEngine()).createUnit(title, manifest);
    },

    getUnitById: async (id: string): Promise<LessonUnit | undefined> => {
        if (isSupabaseConfigured()) return supabaseGetUnitById(id);
        return (await getMockEngine()).getUnitById(id);
    },

    updateUnit: async (id: string, updates: Partial<LessonUnit>): Promise<void> => {
        if (isSupabaseConfigured()) return supabaseUpdateUnit(id, updates);
        return (await getMockEngine()).updateUnit(id, updates);
    },

    unlockNextUnit: async (currentId: string): Promise<void> => {
        if (isSupabaseConfigured()) return supabaseUnlockNextUnit(currentId);
        return (await getMockEngine()).unlockNextUnit(currentId);
    },

    getStudentProgress: async () => {
        if (isSupabaseConfigured()) return supabaseGetStudentProgress();
        return (await getMockEngine()).getStudentProgress();
    },

    updateStudentProgress: async (updates: any) => {
        if (isSupabaseConfigured()) return supabaseUpdateStudentProgress(updates);
        return (await getMockEngine()).updateStudentProgress(updates);
    },

    fetchStudents: async () => {
        if (isSupabaseConfigured()) return supabaseFetchStudents();
        return (await getMockEngine()).fetchStudents();
    },

    addStudent: async (student: any) => {
        if (isSupabaseConfigured()) return supabaseAddStudent(student);
        return (await getMockEngine()).addStudent(student);
    },

    removeStudent: async (id: string) => {
        if (isSupabaseConfigured()) return supabaseRemoveStudent(id);
        return (await getMockEngine()).removeStudent(id);
    },

    updateStudent: async (id: string, updates: any) => {
        // Supabase or mock
        if (isSupabaseConfigured()) {
            await supabase.from('students').update(updates).eq('id', id);
            return;
        }
        return (await getMockEngine()).updateStudent(id, updates);
    },

    fetchSRSItems: async (studentId?: string) => {
        if (isSupabaseConfigured()) return supabaseFetchSRSItems(studentId);
        return (await getMockEngine()).fetchSRSItems(studentId);
    },

    updateSRSItem: async (id: string, quality: number) => {
        if (isSupabaseConfigured()) return supabaseUpdateSRSItem(id, quality);
        return (await getMockEngine()).updateSRSItem(id, quality);
    },

    simulateScan: async (fileName: string): Promise<LessonUnit> => {
        if (isSupabaseConfigured()) return supabaseCreateUnit(fileName);
        return (await getMockEngine()).simulateScan(fileName);
    },

    generateMockLessonData: (fileName: string) => {
        return { title: fileName, vocab: [] };
    },
};
