import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

const addPoints = vi.fn();
const triggerAction = vi.fn();
const pushToRemediation = vi.fn();

let mockStudents: any[] = [
  { id: "s1", name: "Alice", avatar: "🐱", claimed_profile_id: "p1" },
  { id: "s2", name: "Bob", avatar: "🐶", claimed_profile_id: null },
];

let lastAction: any = null;
let currentTurnId: string | null = "turn-1";
let quickWheelWinner: string | null = "s1";

const mockGrammarRule = {
  id: "rule-1",
  rule: "Past Simple",
  pattern_template: "Subj + did not + verb",
  transformation_pairs: [
    { original: "He plays tennis.", transformed: "He played tennis." },
    { original: "She walks home.", transformed: "She walked home." },
    { original: "They eat apples.", transformed: "They ate apples." },
  ],
};

vi.mock("../store/SessionContext", () => ({
  useSeedBase: () => "test-session|u1|0",
  useSession: () => ({
    state: {
      activeUnit: {
        id: "u1",
        manifest: {
          grammar: [mockGrammarRule],
        },
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
  }),
}));

const mockPoolItems = [
  {
    id: "item-1",
    exercise_type: "ERROR_SPOT",
    difficulty: 2,
    content: {
      sentence: "He go to school every day.",
      options: ["goes", "going", "went", "gone"],
      correct_index: 0,
      explanation: "With third-person singular subjects (He/She/It), use goes.",
    },
  },
  {
    id: "item-2",
    exercise_type: "TRANSFORM",
    difficulty: 2,
    content: {
      instruction: "Make it negative",
      prompt_sentence: "She likes apples.",
      options: ["She does not like apples."],
      correct_index: 0,
    },
  },
];

vi.mock("../apps/board/useEscalatingPool", () => ({
  useEscalatingPool: vi.fn(() => ({
    items: mockPoolItems,
    loading: false,
    currentRung: 2,
  })),
}));

vi.mock("../services/attemptsLog", () => ({
  recordAttempt: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/boardLearner", () => ({
  gradeObjective: vi.fn().mockResolvedValue(undefined),
}));

const mockBrowserSpeak = vi.fn();
vi.mock("../services/SpeechService", () => ({
  browserSpeak: (text: string) => mockBrowserSpeak(text),
}));

const mockPlayCue = vi.fn();
vi.mock("../apps/board/templates/playCue", () => ({
  playCue: (cue: string) => mockPlayCue(cue),
}));

import BoardGrammarForge from "../apps/board/templates/BoardGrammarForge";

describe("BoardGrammarForge v3 (PRACTICE / OUTPUT)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastAction = null;
    currentTurnId = "turn-1";
    quickWheelWinner = "s1";
  });

  it("renders Rung 2 Error Spot with dynamic framing and letter badges", () => {
    render(<BoardGrammarForge data={{}} />);

    expect(screen.getByText(/Rung 2/i)).toBeInTheDocument();
    expect(screen.getByText("Grammar Forge")).toBeInTheDocument();
    expect(screen.getByText("Spot the Error")).toBeInTheDocument();
    expect(screen.getByText("Alice's Turn")).toBeInTheDocument();

    // Dynamic framing for replacement words (goes, going, etc. not in wrong sentence)
    expect(screen.getByText(/Sentence with mistake — choose the correct word to fix it:/i)).toBeInTheDocument();
    expect(screen.getByText("He go to school every day.")).toBeInTheDocument();

    // Letter badges A, B, C, D
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("goes")).toBeInTheDocument();
  });

  it("handles correct choice in Error Spot: awards points, plays cue, shows explanation", () => {
    render(<BoardGrammarForge data={{}} />);

    const correctBtn = screen.getByText("goes").closest("button");
    expect(correctBtn).not.toBeNull();
    fireEvent.click(correctBtn!);

    expect(mockPlayCue).toHaveBeenCalledWith("correct");
    expect(addPoints).toHaveBeenCalledWith("s1", expect.any(Number));
    expect(screen.getByText(/Explanation:/i)).toBeInTheDocument();
    expect(screen.getByText(/With third-person singular subjects/i)).toBeInTheDocument();
    expect(screen.getByText("Next Round")).toBeInTheDocument();
  });

  it("supports keyboard shortcut '1' or 'a' to select first option in Error Spot", () => {
    render(<BoardGrammarForge data={{}} />);

    fireEvent.keyDown(window, { key: "1" });

    expect(mockPlayCue).toHaveBeenCalledWith("correct");
    expect(addPoints).toHaveBeenCalledWith("s1", expect.any(Number));
    expect(screen.getByText(/Explanation:/i)).toBeInTheDocument();
  });

  it("handles incorrect choice in Error Spot: deducts mistake penalty and plays wrong cue", () => {
    render(<BoardGrammarForge data={{}} />);

    const wrongBtn = screen.getByText("going").closest("button");
    expect(wrongBtn).not.toBeNull();
    fireEvent.click(wrongBtn!);

    expect(mockPlayCue).toHaveBeenCalledWith("wrong");
    expect(addPoints).toHaveBeenCalledWith("s1", -1);
  });

  it("transitions to Rung 3 Transform and allows tile assembly with audio playback (F6)", () => {
    render(<BoardGrammarForge data={{}} />);

    // Answer Rung 1
    const correctBtn = screen.getByText("goes").closest("button");
    fireEvent.click(correctBtn!);

    // Advance to Rung 2
    const nextBtn = screen.getByText("Next Round");
    fireEvent.click(nextBtn);

    expect(screen.getByText(/Rung 3/i)).toBeInTheDocument();
    expect(screen.getByText("Transform the Sentence")).toBeInTheDocument();
    expect(screen.getByText("She likes apples.")).toBeInTheDocument();
    expect(screen.getByText(/Make it negative — transform:/i)).toBeInTheDocument();

    // Word bank tray tiles
    const targetWords = ["She", "does", "not", "like", "apples."];
    for (const word of targetWords) {
      const tileBtn = screen.getByText(word);
      fireEvent.click(tileBtn);
    }

    // Check answer via button
    const checkBtn = screen.getByText("Check Answer");
    fireEvent.click(checkBtn);

    expect(mockPlayCue).toHaveBeenCalledWith("correct");
    // F6: triggers native sentence TTS
    expect(mockBrowserSpeak).toHaveBeenCalledWith("She does not like apples.");
    expect(screen.getByText("Listen to Sentence")).toBeInTheDocument();
  });

  it("handles keyboard Enter/Space to check transform when all tiles are placed", () => {
    render(<BoardGrammarForge data={{}} />);

    fireEvent.click(screen.getByText("goes").closest("button")!);
    fireEvent.click(screen.getByText("Next Round"));

    const targetWords = ["She", "does", "not", "like", "apples."];
    for (const word of targetWords) {
      fireEvent.click(screen.getByText(word));
    }

    fireEvent.keyDown(window, { key: "Enter" });

    expect(mockPlayCue).toHaveBeenCalledWith("correct");
    expect(mockBrowserSpeak).toHaveBeenCalledWith("She does not like apples.");
  });

  it("transitions to Rung 4 Produce and supports rating and choral toggle", () => {
    render(<BoardGrammarForge data={{}} />);

    // Complete Rung 1
    fireEvent.click(screen.getByText("goes").closest("button")!);
    fireEvent.click(screen.getByText("Next Round"));

    // Complete Rung 2
    const targetWords = ["She", "does", "not", "like", "apples."];
    for (const word of targetWords) {
      fireEvent.click(screen.getByText(word));
    }
    fireEvent.click(screen.getByText("Check Answer"));
    fireEvent.click(screen.getByText("Next Round"));

    // Rung 4 Produce
    expect(screen.getByText(/Rung 4/i)).toBeInTheDocument();
    expect(screen.getByText("Produce Freely")).toBeInTheDocument();
    expect(screen.getByText("They eat apples.")).toBeInTheDocument();
    expect(screen.getByText("Subj + did not + verb")).toBeInTheDocument();

    // Toggle Choral Mode
    const modeBtn = screen.getByText(/Mode:/i);
    fireEvent.click(modeBtn);
    expect(screen.getByText(/Choral — Class Produces Together/i)).toBeInTheDocument();

    // Rate Correct
    const rateCorrectBtn = screen.getByText("✓ Correct");
    fireEvent.click(rateCorrectBtn);

    // Shows revealed model answer and speaks
    expect(screen.getByText("They ate apples.")).toBeInTheDocument();
    expect(mockBrowserSpeak).toHaveBeenCalledWith("They ate apples.");
    expect(screen.getByText("Complete Slide")).toBeInTheDocument();
  });

  it("responds to remote actions REVEAL_ANSWER and RESET_GAME", () => {
    lastAction = { type: "REVEAL_ANSWER", timestamp: Date.now() };
    const { rerender } = render(<BoardGrammarForge data={{}} />);

    expect(screen.getByText(/Explanation:/i)).toBeInTheDocument();

    lastAction = { type: "RESET_GAME", timestamp: Date.now() + 1 };
    rerender(<BoardGrammarForge data={{}} />);

    expect(screen.queryByText(/Explanation:/i)).not.toBeInTheDocument();
  });
});
