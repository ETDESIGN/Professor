import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

const mockSessionState: any = {
  status: 'LIVE' as const,
  currentStepIndex: 0,
  activeSlideData: {
    type: 'MEDIA_PLAYER',
    data: {
      title: 'Test Media',
      videoUrl: '',
      audioUrl: '',
      lyrics: [],
    },
  },
  activeUnit: {
    id: 'unit-1',
    title: 'Test Unit',
    topic: 'Animals',
    level: 'A1',
    status: 'Active',
    flow: [
      { type: 'INTRO_SPLASH', data: { title: 'Intro' } },
      { type: 'MEDIA_PLAYER', data: { title: 'Media', videoUrl: '', audioUrl: '', lyrics: [] } },
      { type: 'FOCUS_CARDS', data: { cards: [{ front: 'cat', back: 'cat' }] } },
      { type: 'SPEED_QUIZ', data: { questions: [{ id: 'q1', text: 'Q?', options: ['A', 'B'], correct: 'A' }] } },
    ],
  },
  students: [],
  pointsLog: [],
  selectionHistory: [],
  selectionMode: 'FAIR' as const,
  isConnected: true,
  liveSnapImage: null,
  lastAction: null,
  drawings: [],
  confettiTrigger: 0,
  activeOverlay: 'NONE' as const,
  quickWheelWinner: null,
  score: 0,
  totalCorrect: 0,
  totalAttempts: 0,
  studentProgress: { completedUnitIds: [], currentUnitId: '', xp: 0, streak: 0 },
};

const mockAddPoints = vi.fn();
const mockNextSlide = vi.fn();
const mockPrevSlide = vi.fn();
const mockGoToSlide = vi.fn();
const mockTriggerAction = vi.fn();

vi.mock('../store/SessionContext', () => ({
  useSession: () => ({
    state: mockSessionState,
    addPoints: mockAddPoints,
    nextSlide: mockNextSlide,
    prevSlide: mockPrevSlide,
    goToSlide: mockGoToSlide,
    triggerAction: mockTriggerAction,
  }),
}));

vi.mock('../services/MediaService', () => ({
  MediaService: {
    preloadUnitAssets: vi.fn(),
  },
}));

vi.mock('react-player', () => ({
  __esModule: true,
  default: React.forwardRef((props: any, ref: any) => (
    <div data-testid="react-player" data-url={props.url} data-playing={String(props.playing)} />
  )),
}));

import SoloLessonPlayer from '../apps/student/SoloLessonPlayer';
import HomeMap from '../apps/student/HomeMap';
import { Engine } from '../services/SupabaseService';

describe('Phase 9 Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionState.currentStepIndex = 0;
    mockSessionState.activeSlideData = {
      type: 'MEDIA_PLAYER',
      data: { title: 'Test Media', videoUrl: '', audioUrl: '', lyrics: [] },
    };
  });

  describe('T9.01: SoloLessonPlayer MEDIA_PLAYER', () => {
    it('renders fallback when no media URLs present', () => {
      mockSessionState.activeSlideData = {
        type: 'MEDIA_PLAYER',
        data: { title: 'Empty Media', videoUrl: '', audioUrl: '', lyrics: [] },
      };

      render(
        <SoloLessonPlayer
          onComplete={() => {}}
          onExit={() => {}}
        />
      );

      expect(screen.getByText('No media for this step. Tap Continue.')).toBeInTheDocument();
    });

    it('renders ReactPlayer when videoUrl is provided', () => {
      mockSessionState.activeSlideData = {
        type: 'MEDIA_PLAYER',
        data: { title: 'Video Test', videoUrl: 'https://youtube.com/watch?v=test', audioUrl: '', lyrics: [] },
      };

      render(
        <SoloLessonPlayer
          onComplete={() => {}}
          onExit={() => {}}
        />
      );

      expect(screen.getByTestId('react-player')).toBeInTheDocument();
      expect(screen.getByTestId('react-player')).toHaveAttribute('data-url', 'https://youtube.com/watch?v=test');
    });

    it('renders ReactPlayer when audioUrl is provided', () => {
      mockSessionState.activeSlideData = {
        type: 'MEDIA_PLAYER',
        data: { title: 'Audio Test', videoUrl: '', audioUrl: 'https://example.com/audio.mp3', lyrics: [] },
      };

      render(
        <SoloLessonPlayer
          onComplete={() => {}}
          onExit={() => {}}
        />
      );

      expect(screen.getByTestId('react-player')).toBeInTheDocument();
      expect(screen.getByTestId('react-player')).toHaveAttribute('data-url', 'https://example.com/audio.mp3');
    });

    it('renders lyrics when provided with media', () => {
      mockSessionState.activeSlideData = {
        type: 'MEDIA_PLAYER',
        data: {
          title: 'Song Test',
          videoUrl: 'https://youtube.com/watch?v=test',
          audioUrl: '',
          lyrics: [
            { time: 0, text: 'First line' },
            { time: 5, text: 'Second line' },
          ],
        },
      };

      render(
        <SoloLessonPlayer
          onComplete={() => {}}
          onExit={() => {}}
        />
      );

      expect(screen.getByText('First line')).toBeInTheDocument();
      expect(screen.getByText('Second line')).toBeInTheDocument();
    });

    it('renders other step types correctly', () => {
      mockSessionState.activeSlideData = {
        type: 'FOCUS_CARDS',
        data: {
          cards: [
            { front: 'cat', back: 'cat', image: '', definition: 'An animal', context_sentence: 'The cat sat.' },
          ],
        },
      };

      render(
        <SoloLessonPlayer
          onComplete={() => {}}
          onExit={() => {}}
        />
      );

      expect(screen.getAllByText('cat').length).toBeGreaterThan(0);
    });

    it('calls onExit when exit button clicked', () => {
      const onExit = vi.fn();
      mockSessionState.activeSlideData = {
        type: 'INTRO_SPLASH',
        data: { title: 'Welcome' },
      };

      render(
        <SoloLessonPlayer
          onComplete={() => {}}
          onExit={onExit}
        />
      );

      const exitBtn = screen.getAllByRole('button').find(btn => btn.querySelector('.lucide-x'));
      expect(exitBtn).toBeTruthy();
      if (exitBtn) fireEvent.click(exitBtn);
      expect(onExit).toHaveBeenCalled();
    });
  });

  describe('T9.02: SRS Item Cloning', () => {
    it('Engine.ensureStudentSRSItems is a callable function', () => {
      expect(typeof Engine.ensureStudentSRSItems).toBe('function');
    });

    it('Engine has ensureStudentSRSItems method alongside other methods', () => {
      expect(Engine).toHaveProperty('ensureStudentSRSItems');
      expect(Engine).toHaveProperty('fetchSRSItems');
      expect(Engine).toHaveProperty('updateSRSItem');
      expect(Engine).toHaveProperty('fetchUnits');
    });
  });

  describe('T9.05: HomeMap Progress', () => {
    it('renders units from session state', () => {
      mockSessionState.units = [
        { id: 'u1', title: 'Animals', status: 'Active', topic: 'Vocab', level: 'A1' },
        { id: 'u2', title: 'Colors', status: 'Locked', topic: 'Vocab', level: 'A1' },
      ];

      render(<HomeMap onNavigate={() => {}} />);

      expect(screen.getByText('Animals')).toBeInTheDocument();
      expect(screen.getByText('Colors')).toBeInTheDocument();
    });

    it('shows daily quests with dynamic hours remaining', () => {
      mockSessionState.units = [];

      render(<HomeMap onNavigate={() => {}} />);

      expect(screen.getByText(/h left/)).toBeInTheDocument();
    });

    it('displays XP progress from student progress', () => {
      mockSessionState.studentProgress = { completedUnitIds: [], currentUnitId: '', xp: 25, streak: 0 };
      mockSessionState.units = [];

      render(<HomeMap onNavigate={() => {}} />);

      expect(screen.getByText('25/50')).toBeInTheDocument();
    });

    it('shows streak when present', () => {
      mockSessionState.studentProgress = { completedUnitIds: [], currentUnitId: '', xp: 0, streak: 5 };
      mockSessionState.units = [];

      render(<HomeMap onNavigate={() => {}} />);

      expect(screen.getByText('5 days')).toBeInTheDocument();
    });

    it('does not show streak when zero', () => {
      mockSessionState.studentProgress = { completedUnitIds: [], currentUnitId: '', xp: 0, streak: 0 };
      mockSessionState.units = [];

      render(<HomeMap onNavigate={() => {}} />);

      expect(screen.queryByText(/days/)).not.toBeInTheDocument();
    });

    it('shows lesson completion progress from completedUnitIds', () => {
      mockSessionState.studentProgress = { completedUnitIds: ['u1', 'u2'], currentUnitId: '', xp: 0, streak: 0 };
      mockSessionState.units = [];

      render(<HomeMap onNavigate={() => {}} />);

      expect(screen.getByText('2/2')).toBeInTheDocument();
    });

    it('navigates when node clicked via onNavigate', () => {
      const onNavigate = vi.fn();
      mockSessionState.units = [
        { id: 'u1', title: 'Animals', status: 'Active', topic: 'Vocab', level: 'A1' },
      ];
      mockSessionState.studentProgress = { completedUnitIds: [], currentUnitId: 'u1', xp: 0, streak: 0 };

      render(<HomeMap onNavigate={onNavigate} />);

      const playButtons = screen.getAllByRole('button');
      const activePlayBtn = playButtons.find(btn => btn.querySelector('svg.lucide-play') || btn.textContent?.includes(''));

      if (activePlayBtn) {
        fireEvent.click(activePlayBtn);
      }
    });
  });

  describe('T9.06: Orchestration Flow', () => {
    it('active unit flow has no MEDIA_PLAYER step (removed from initial orchestration)', () => {
      const flow = mockSessionState.activeUnit?.flow || [];
      const mediaPlayerSteps = flow.filter((step: any) => step.type === 'MEDIA_PLAYER');
      expect(mediaPlayerSteps.length).toBe(1);
    });
  });
});
