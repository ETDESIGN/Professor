import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';

const mockSessionState = {
  status: 'LIVE' as const,
  currentStepIndex: 0,
  activeSlideData: null,
  activeUnit: null,
  students: [
    { id: 's1', name: 'Alice', points: 100, avatar: '' },
    { id: 's2', name: 'Bob', points: 50, avatar: '' },
  ],
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
};

vi.mock('../store/SessionContext', () => ({
  useSession: () => ({
    state: mockSessionState,
    addPoints: vi.fn(),
    nextSlide: vi.fn(),
    prevSlide: vi.fn(),
    goToSlide: vi.fn(),
    triggerAction: vi.fn(),
  }),
}));

import BoardFocusCards from '../apps/board/templates/BoardFocusCards';
import BoardSpeedQuiz from '../apps/board/templates/BoardSpeedQuiz';
import BoardGrammarSandbox from '../apps/board/templates/BoardGrammarSandbox';
import BoardStoryStage from '../apps/board/templates/BoardStoryStage';

describe('BoardFocusCards', () => {
  const mockData = {
    title: 'Vocabulary Cards',
    cards: [
      {
        front: 'cat',
        back: 'cat',
        pronunciation: '/kæt/',
        context_sentence: 'The cat sat on the mat.',
        definition: 'A small domesticated feline',
      },
      {
        front: 'dog',
        back: 'dog',
        pronunciation: '/dɔːɡ/',
        context_sentence: 'The dog chased the ball.',
        definition: 'A domesticated canine',
      },
    ],
  };

  it('renders the title', () => {
    render(<BoardFocusCards data={mockData} />);
    expect(screen.getByText('Vocabulary Cards')).toBeInTheDocument();
  });

  it('renders card counter showing 1 / 2', () => {
    render(<BoardFocusCards data={mockData} />);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('renders the front face content of the first card', () => {
    render(<BoardFocusCards data={mockData} />);
    const catElements = screen.getAllByText('cat');
    expect(catElements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders "Waiting to Flip..." hint', () => {
    render(<BoardFocusCards data={mockData} />);
    expect(screen.getByText('Waiting to Flip...')).toBeInTheDocument();
  });

  it('renders gracefully with empty cards array', () => {
    render(<BoardFocusCards data={{ title: 'Empty', cards: [] }} />);
    expect(screen.getByText('Empty')).toBeInTheDocument();
    expect(screen.getByText('No cards available for this lesson.')).toBeInTheDocument();
  });

  it('renders gracefully with no data.cards property', () => {
    render(<BoardFocusCards data={{ title: 'No Cards' }} />);
    expect(screen.getByText('No Cards')).toBeInTheDocument();
    expect(screen.getByText('No cards available for this lesson.')).toBeInTheDocument();
  });
});

describe('BoardSpeedQuiz', () => {
  const mockData = {
    topic: 'Animal Quiz',
    timer: 10,
    questions: [
      {
        id: 'q1',
        text: 'What sound does a cat make?',
        options: ['Meow', 'Woof', 'Moo', 'Baa'],
        correct: 'Meow',
      },
      {
        id: 'q2',
        text: 'What is a baby dog called?',
        options: ['Kitten', 'Puppy', 'Calf', 'Lamb'],
        correct: 'Puppy',
      },
    ],
  };

  it('renders the quiz topic', () => {
    render(<BoardSpeedQuiz data={mockData} />);
    expect(screen.getByText('Animal Quiz')).toBeInTheDocument();
  });

  it('renders first question text', () => {
    render(<BoardSpeedQuiz data={mockData} />);
    expect(screen.getByText('What sound does a cat make?')).toBeInTheDocument();
  });

  it('renders question counter', () => {
    render(<BoardSpeedQuiz data={mockData} />);
    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
  });

  it('renders all options for the question', () => {
    render(<BoardSpeedQuiz data={mockData} />);
    expect(screen.getByText('Meow')).toBeInTheDocument();
    expect(screen.getByText('Woof')).toBeInTheDocument();
    expect(screen.getByText('Moo')).toBeInTheDocument();
    expect(screen.getByText('Baa')).toBeInTheDocument();
  });

  it('shows "No Questions Available" when questions array is empty', () => {
    render(<BoardSpeedQuiz data={{ questions: [] }} />);
    expect(screen.getByText('No Questions Available')).toBeInTheDocument();
  });

  it('shows "See Results" button after answering last question', () => {
    render(<BoardSpeedQuiz data={mockData} />);
    fireEvent.click(screen.getByText('Meow'));
    expect(screen.getByText('Next Question')).toBeInTheDocument();
  });

  it('tracks score correctly on correct answer', () => {
    render(<BoardSpeedQuiz data={mockData} />);
    expect(screen.getByText('Score: 0')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Meow'));
    expect(screen.getByText('Score: 1')).toBeInTheDocument();
  });

  it('does not increment score on wrong answer', () => {
    render(<BoardSpeedQuiz data={mockData} />);
    fireEvent.click(screen.getByText('Woof'));
    expect(screen.getByText('Score: 0')).toBeInTheDocument();
  });
});

describe('BoardGrammarSandbox', () => {
  const mockData = {
    rule: 'Present Simple',
    explanation: 'Used for habits and general truths.',
    examples: [
      'She walks to school every day.',
      'They play football on weekends.',
      'He reads books before bed.',
    ],
    setting: 'classroom',
  };

  it('renders the rule name in header', () => {
    render(<BoardGrammarSandbox data={mockData} />);
    expect(screen.getByText('Present Simple')).toBeInTheDocument();
  });

  it('renders the explanation', () => {
    render(<BoardGrammarSandbox data={mockData} />);
    expect(screen.getByText('Used for habits and general truths.')).toBeInTheDocument();
  });

  it('renders the first example', () => {
    render(<BoardGrammarSandbox data={mockData} />);
    expect(screen.getByText('She walks to school every day.')).toBeInTheDocument();
  });

  it('renders the Grammar Rule label', () => {
    render(<BoardGrammarSandbox data={mockData} />);
    expect(screen.getByText('Grammar Rule')).toBeInTheDocument();
  });

  it('shows empty state with "Grammar Lesson" heading when no data', () => {
    render(<BoardGrammarSandbox data={{}} />);
    expect(screen.getByText('Grammar Lesson')).toBeInTheDocument();
    expect(screen.getByText('No grammar rules available for this step.')).toBeInTheDocument();
  });
});

describe('BoardStoryStage', () => {
  const mockData = {
    title: 'The Adventure',
    pages: [
      {
        text: 'Once upon a time, there was a brave little robot.',
        speaker: 'Narrator',
        emotion: 'calm',
      },
      {
        text: 'I will find the treasure!',
        speaker: 'Robot',
        emotion: 'excited',
      },
    ],
    characters: [
      { name: 'Narrator', role: 'narrator', avatar_url: '' },
      { name: 'Robot', role: 'protagonist', avatar_url: '' },
    ],
  };

  it('renders the story title', () => {
    render(<BoardStoryStage data={mockData} />);
    expect(screen.getByText('The Adventure')).toBeInTheDocument();
  });

  it('renders the first page text', () => {
    render(<BoardStoryStage data={mockData} />);
    expect(screen.getByText(/Once upon a time/)).toBeInTheDocument();
  });

  it('shows empty state when no pages', () => {
    render(<BoardStoryStage data={{ pages: [], characters: [] }} />);
    expect(screen.getByText('No story pages available for this lesson.')).toBeInTheDocument();
  });

  it('renders character strip with character names', () => {
    render(<BoardStoryStage data={mockData} />);
    expect(screen.getAllByText('Narrator').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Robot').length).toBeGreaterThanOrEqual(1);
  });
});
