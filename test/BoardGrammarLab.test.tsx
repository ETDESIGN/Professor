import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";

const addPoints = vi.fn();
const triggerAction = vi.fn();
const pushToRemediation = vi.fn();
const triggerConfetti = vi.fn();

let mockStudents: any[] = [
  { id: "s1", name: "Alice", avatar: "🐱", claimed_profile_id: "p1" },
  { id: "s2", name: "Bob", avatar: "🐶", claimed_profile_id: null },
];

let lastAction: any = null;
let currentTurnId: string | null = "turn-1";
let quickWheelWinner: string | null = "s1";
let mockPoolLoading = false;
let mockPoolItems: any[] = [];

vi.mock("../store/SessionContext", () => ({
  useSeedBase: () => "test-session|u1|0",
  useSession: () => ({
    state: {
      activeUnit: {
        id: "u1",
        manifest: { title: "Unit 1" },
      },
      students: mockStudents,
      quickWheelWinner,
      currentTurnId,
      lastAction,
      activeClassId: "c1",
    },
    addPoints,
    triggerAction,
    pushToRemediation,
    triggerConfetti,
  }),
}));

vi.mock("../apps/board/useEscalatingPool", () => ({
  useEscalatingPool: vi.fn(() => ({
    items: mockPoolItems,
    loading: mockPoolLoading,
  })),
}));

vi.mock("../services/attemptsLog", () => ({
  recordAttempt: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/boardLearner", () => ({
  gradeObjective: vi.fn().mockResolvedValue(undefined),
}));

const mockPlayCue = vi.fn();
vi.mock("../apps/board/templates/playCue", () => ({
  playCue: (cue: string) => mockPlayCue(cue),
}));

const mockBrowserSpeak = vi.fn();
const mockPlayAudioUrl = vi.fn().mockResolvedValue(true);
vi.mock("../services/SpeechService", () => ({
  playAudioUrl: (...args: any[]) => mockPlayAudioUrl(...args),
  browserSpeak: (...args: any[]) => mockBrowserSpeak(...args),
}));

import BoardGrammarLab from "../apps/board/templates/BoardGrammarLab";

describe("BoardGrammarLab v3 (PRACTICE)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    lastAction = null;
    currentTurnId = "turn-1";
    quickWheelWinner = "s1";
    mockPoolLoading = false;
    mockPoolItems = [];
  });

  it("renders kid-friendly bilingual warming-up holding state when pool is empty", () => {
    mockPoolItems = [];
    mockPoolLoading = false;

    render(<BoardGrammarLab />);

    // Kid-friendly holding text from Stitch design #2
    expect(screen.getByText("Grammar Lab is warming up!")).toBeInTheDocument();
    expect(screen.getByText("语法实验准备中…")).toBeInTheDocument();
    expect(
      screen.getByText("Ask your teacher to generate exercises for this unit.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /skip/i })).toBeInTheDocument();

    // No developer jargon
    expect(screen.queryByText(/No practice items ready yet/i)).not.toBeInTheDocument();
  });

  it("renders formula pattern beat with color-coded syntax pills and rule title", () => {
    mockPoolItems = [
      {
        id: "trans-1",
        exercise_type: "TRANSFORM",
        difficulty: 3,
        objective_id: "obj-1",
        content: {
          instruction: "Subject + Verb + Object",
          prompt_sentence: "The monkey eats a banana.",
          options: ["The monkey ate a banana.", "The monkey climbs a tree."],
          correct_index: 0,
          explanation: "Use past tense 'ate' instead of present 'eats'.",
        },
      },
    ];

    render(<BoardGrammarLab />);

    // Pattern presentation beat
    expect(screen.getByText(/Formula Beat/i)).toBeInTheDocument();
    expect(screen.getByText("Subject")).toBeInTheDocument();
    expect(screen.getByText("Verb")).toBeInTheDocument();
    expect(screen.getByText("Object")).toBeInTheDocument();
    expect(
      screen.getByText("Use past tense 'ate' instead of present 'eats'.")
    ).toBeInTheDocument();
  });

  it("advances to TRANSFORM runway and allows placing and removing word tiles", () => {
    mockPoolItems = [
      {
        id: "trans-1",
        exercise_type: "TRANSFORM",
        difficulty: 3,
        objective_id: "obj-1",
        content: {
          instruction: "Make it past tense",
          prompt_sentence: "The monkey eats a banana.",
          options: ["The monkey ate a banana.", "The monkey climbs a tree."],
          correct_index: 0,
        },
      },
    ];

    render(<BoardGrammarLab />);

    // Fast-forward past 2s pattern beat
    act(() => {
      vi.advanceTimersByTime(2100);
    });

    // Runway should mount
    expect(screen.getByText("Sentence Assembly Runway")).toBeInTheDocument();
    expect(screen.getByText("Word Bank Tiles")).toBeInTheDocument();

    // Target words should be available in bank
    const ateBtn = screen.getByRole("button", { name: "ate" });
    expect(ateBtn).toBeInTheDocument();

    // Tap tile into runway
    fireEvent.click(ateBtn);

    // Tile is now placed in slot and check button appears
    expect(screen.getByText("Check Sentence")).toBeInTheDocument();
  });

  it("renders ERROR_SPOT with clarified prompt framing and awards points on correct option", () => {
    mockPoolItems = [
      {
        id: "err-1",
        exercise_type: "ERROR_SPOT",
        difficulty: 2,
        objective_id: "obj-2",
        content: {
          sentence: "Penguins living in the cold snow.",
          options: ["live", "living", "is live", "lives"],
          correct_index: 0,
          explanation: "Penguins is plural, so use the base verb 'live'.",
        },
      },
    ];

    render(<BoardGrammarLab />);

    // Fast-forward past 2s pattern beat
    act(() => {
      vi.advanceTimersByTime(2100);
    });

    // Dynamic framing correctly identifies options contain the wrong word in the sentence
    expect(
      screen.getByText("Spot the wrong word in this sentence:")
    ).toBeInTheDocument();
    expect(screen.getByText("Penguins living in the cold snow.")).toBeInTheDocument();

    // A/B/C/D letter badges
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();

    // Tap correct option (index 0: "Alive")
    const correctBtn = screen.getByRole("button", { name: /^Alive$/i });
    fireEvent.click(correctBtn);

    // Points awarded to Alice
    expect(addPoints).toHaveBeenCalledWith("s1", expect.any(Number));

    // Feedback card appears with hear sentence button
    expect(screen.getByText(/Alice cracked the grammar!/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hear Sentence/i })).toBeInTheDocument();

    // Tap hear sentence
    fireEvent.click(screen.getByRole("button", { name: /Hear Sentence/i }));
    expect(mockBrowserSpeak).toHaveBeenCalledWith("live");
  });

  it("displays owner animated 🏆 celebration on complete phase", () => {
    mockPoolItems = [
      {
        id: "err-1",
        exercise_type: "ERROR_SPOT",
        difficulty: 2,
        objective_id: "obj-2",
        content: {
          sentence: "They goes to school.",
          options: ["go", "goes"],
          correct_index: 0,
        },
      },
    ];

    const { rerender } = render(<BoardGrammarLab />);

    // Remote SLIDE_COMPLETE
    lastAction = { type: "SLIDE_COMPLETE", timestamp: Date.now() };
    rerender(<BoardGrammarLab />);

    expect(screen.getByText("Grammar Lab Complete!")).toBeInTheDocument();
    expect(screen.getByText("🏆")).toBeInTheDocument();
    expect(screen.getByText("All 3 rounds practiced")).toBeInTheDocument();
  });
});
