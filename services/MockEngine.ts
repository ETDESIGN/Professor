
import { MOCK_LESSON_FLOW } from '../store/mockData';
import { LessonManifest } from './geminiService';
import { transformManifestToFlow } from './LessonTransformer';

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

// Initial Mock Database
const INITIAL_DB: LessonUnit[] = [
  {
    id: 'u1',
    title: 'Unit 1: Jungle Safari',
    level: 'Beginner',
    status: 'Active',
    lessons: 4,
    coverImage: 'https://api.dicebear.com/7.x/shapes/svg?seed=jungle&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5be',
    lastUpdated: '2d ago',
    flow: MOCK_LESSON_FLOW,
    topic: 'Animals',
    scannedAssets: []
  },
  {
    id: 'u2',
    title: 'Unit 2: My Family',
    level: 'Beginner',
    status: 'Draft',
    lessons: 3,
    coverImage: 'https://api.dicebear.com/7.x/shapes/svg?seed=family&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5be',
    lastUpdated: '5d ago',
    flow: [],
    topic: 'Family',
    scannedAssets: []
  },
  {
    id: 'u3',
    title: 'Unit 3: Space Travel',
    level: 'Intermediate',
    status: 'Locked',
    lessons: 5,
    coverImage: 'https://api.dicebear.com/7.x/shapes/svg?seed=space&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5be',
    lastUpdated: '1w ago',
    flow: [],
    topic: 'Space',
    scannedAssets: []
  }
];

let STUDENT_PROGRESS = {
  completedUnitIds: ['u0'] as string[],
  currentUnitId: 'u1',
  xp: 1250,
  streak: 12
};

let MOCK_DB = [...INITIAL_DB];

let SRS_ITEMS = [
  { id: '1', word: 'Apple', translation: 'Manzana', interval: 1, repetition: 1, efactor: 2.5, next_review: new Date(Date.now() - 86400000).toISOString(), status: 'weak' },
  { id: '2', word: 'Dog', translation: 'Perro', interval: 6, repetition: 2, efactor: 2.6, next_review: new Date(Date.now() - 172800000).toISOString(), status: 'review' },
  { id: '3', word: 'Cat', translation: 'Gato', interval: 0, repetition: 0, efactor: 2.5, next_review: new Date().toISOString(), status: 'new' },
  { id: '4', word: 'House', translation: 'Casa', interval: 0, repetition: 0, efactor: 2.5, next_review: new Date().toISOString(), status: 'new' },
  { id: '5', word: 'Tree', translation: 'Árbol', interval: 1, repetition: 1, efactor: 2.0, next_review: new Date(Date.now() - 3600000).toISOString(), status: 'weak' }
];

export const MockEngine = {
  fetchUnits: async (): Promise<LessonUnit[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return MOCK_DB;
  },

  createUnit: async (title: string, manifest?: LessonManifest): Promise<LessonUnit> => {
    let generatedFlow = [];
    if (manifest) {
      generatedFlow = await transformManifestToFlow(manifest);
    }

    const newUnit: LessonUnit = {
      id: `u_${Date.now()}`,
      title: manifest?.meta.unit_title || title,
      level: manifest?.meta.difficulty_cefr || 'Draft',
      status: 'Processing',
      lessons: manifest?.timeline.length || 0,
      coverImage: `https://api.dicebear.com/7.x/shapes/svg?seed=${Date.now()}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5be`,
      lastUpdated: new Date().toISOString(),
      flow: generatedFlow,
      scannedAssets: [],
      manifest: manifest,
      topic: manifest?.meta.theme || 'General'
    };

    MOCK_DB.unshift(newUnit);
    return newUnit;
  },

  generateMockLessonData: (fileName: string) => {
    return { title: fileName, vocab: [] };
  },

  simulateScan: async (fileName: string): Promise<LessonUnit> => {
    return MockEngine.createUnit(fileName);
  },

  getUnitById: async (id: string): Promise<LessonUnit | undefined> => {
    return MOCK_DB.find(u => u.id === id);
  },

  updateUnit: async (id: string, updates: Partial<LessonUnit>): Promise<void> => {
    if (updates.manifest) {
      updates.flow = await transformManifestToFlow(updates.manifest);
    }

    await new Promise(resolve => setTimeout(resolve, 200));
    MOCK_DB = MOCK_DB.map(u => u.id === id ? { ...u, ...updates, lastUpdated: new Date().toISOString() } : u);
  },

  unlockNextUnit: async (currentId: string): Promise<void> => {
    let currentProgress = { ...STUDENT_PROGRESS };

    if (!currentProgress.completedUnitIds.includes(currentId)) {
      currentProgress.completedUnitIds.push(currentId);
    }

    // Find next unit
    let nextUnitId = currentProgress.currentUnitId;

    const idx = MOCK_DB.findIndex(u => u.id === currentId);
    if (idx !== -1 && idx < MOCK_DB.length - 1) {
      const nextUnit = MOCK_DB[idx + 1];
      nextUnitId = nextUnit.id;
      nextUnit.status = 'Active';
    }

    currentProgress.currentUnitId = nextUnitId;
    STUDENT_PROGRESS = currentProgress;
  },

  getStudentProgress: async () => {
    return STUDENT_PROGRESS;
  },

  fetchStudents: async () => {
    // Fallback to mock data
    const { MOCK_STUDENTS } = await import('../store/mockData');
    return MOCK_STUDENTS;
  },

  addStudent: async (student: any) => {
    return { ...student, id: `s${Date.now()}` };
  },

  removeStudent: async (id: string) => {
    // Mock deletion
  },

  updateStudent: async (id: string, updates: any) => {
    // Mock update
  },

  updateStudentProgress: async (updates: Partial<typeof STUDENT_PROGRESS>) => {
    STUDENT_PROGRESS = { ...STUDENT_PROGRESS, ...updates };
    return STUDENT_PROGRESS;
  },

  fetchSRSItems: async (studentId: string = 'default_student') => {
    // Return items that are due for review
    return SRS_ITEMS.filter(item => new Date(item.next_review) <= new Date());
  },

  updateSRSItem: async (id: string, quality: number) => {
    // Quality: 0-5 (0 = complete blackout, 5 = perfect response)
    const index = SRS_ITEMS.findIndex(item => item.id === id);
    if (index === -1) return;

    let item = { ...SRS_ITEMS[index] };
    let { interval, repetition, efactor } = item;

    if (quality >= 3) {
      if (repetition === 0) {
        interval = 1;
      } else if (repetition === 1) {
        interval = 6;
      } else {
        interval = Math.round(interval * efactor);
      }
      repetition += 1;
    } else {
      repetition = 0;
      interval = 1;
    }

    efactor = efactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (efactor < 1.3) efactor = 1.3;

    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + interval);

    // Determine status based on efactor and quality
    let status = 'review';
    if (quality < 3 || efactor < 2.0) {
      status = 'weak';
    } else if (repetition === 0) {
      status = 'new';
    }

    SRS_ITEMS[index] = {
      ...item,
      interval,
      repetition,
      efactor,
      next_review: nextReview.toISOString(),
      status
    };
  }
};
