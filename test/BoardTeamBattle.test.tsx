import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const addPoints = vi.fn();
const triggerAction = vi.fn();
const pushToRemediation = vi.fn();
const triggerConfetti = vi.fn();

let mockStudents: any[] = [
  { id: "s1", name: "Alice", team: "red", avatar: "🐱", claimed_profile_id: null },
  { id: "s2", name: "Bob", team: "red", avatar: "🐶", claimed_profile_id: null },
  { id: "s3", name: "Charlie", team: "blue", avatar: "🦊", claimed_profile_id: null },
  { id: "s4", name: "David", team: "blue", avatar: "🐼", claimed_profile_id: null },
];

let lastAction: any = null;
let currentTurnId: string | null = "turn-1";

vi.mock("../store/SessionContext", () => ({
  useSeedBase: () => "test-session|u1|0",
  useSession: () => ({
    state: {
      activeUnit: { id: "u1" },
      students: mockStudents,
      quickWheelWinner: null,
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

const mockQuestions = [
  {
    objectiveId: "obj-1",
    exerciseType: "MEANING_MATCH",
    difficulty: 1,
    item: {
      exercise_type: "MEANING_MATCH",
      content: {
        prompt: "helicopter",
        options: ["直升机", "飞机", "汽车", "轮船"],
        correct_index: 0,
      },
    },
  },
  {
    objectiveId: "obj-2",
    exerciseType: "WORD_BANK_BUILD",
    difficulty: 2,
    item: {
      exercise_type: "WORD_BANK_BUILD",
      content: {
        target_sentence: "The cat is sleeping",
        word_bank: ["The", "cat", "is", "sleeping", "dog", "running"],
      },
    },
  },
];

vi.mock("../apps/board/quizEngine", () => ({
  useQuizComposition: vi.fn(() => ({
    questions: mockQuestions,
    loading: false,
  })),
}));

vi.mock("../services/attemptsLog", () => ({
  recordAttempt: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/boardLearner", () => ({
  gradeObjective: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/SpeechService", () => ({
  playAudioUrl: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../apps/board/templates/playCue", () => ({
  playCue: vi.fn(),
}));

import BoardTeamBattle from "../apps/board/templates/BoardTeamBattle";

describe("BoardTeamBattle v3 (ASSESS phase)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastAction = null;
    currentTurnId = "turn-1";
  });

  const advanceToQuestionPhase = () => {
    for (let i = 0; i < 5; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }
  };

  it("renders pregame countdown and transitions to question phase", async () => {
    vi.useFakeTimers();
    render(<BoardTeamBattle data={{}} />);

    expect(screen.getByText(/Arena Clash!/i)).toBeInTheDocument();
    expect(screen.getByText("Red Team")).toBeInTheDocument();
    expect(screen.getByText("Blue Team")).toBeInTheDocument();

    advanceToQuestionPhase();

    expect(screen.getByText(/What does "helicopter" mean\?/i)).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("keeps 3x3 tactical arena permanently visible during question phase (F4)", async () => {
    vi.useFakeTimers();
    render(<BoardTeamBattle data={{}} />);

    advanceToQuestionPhase();

    // 3x3 arena header is present during questions
    expect(screen.getByText(/Tactical 3×3 Arena/i)).toBeInTheDocument();
    // 9 grid cells exist
    const cells = screen.getAllByRole("button").filter(b => b.className.includes("tb-cell"));
    expect(cells.length).toBe(9);
    vi.useRealTimers();
  });

  it("answering MCQ correctly awards points and advances to choose_cell phase", async () => {
    vi.useFakeTimers();
    render(<BoardTeamBattle data={{}} />);

    advanceToQuestionPhase();

    // Option 0 is "直升机" (correct)
    const opt = screen.getByText("直升机");
    fireEvent.click(opt);

    expect(addPoints).toHaveBeenCalled();

    // Wait for reveal hold
    for (let i = 0; i < 3; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }

    expect(screen.getByText(/Claim Your Cell!/i)).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("allows clicking an open cell in choose_cell phase to claim territory", async () => {
    vi.useFakeTimers();
    render(<BoardTeamBattle data={{}} />);

    advanceToQuestionPhase();

    // Answer correctly
    fireEvent.click(screen.getByText("直升机"));

    for (let i = 0; i < 3; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }

    // Grid cells in choose_cell phase have CLAIM
    const claimCells = screen.getAllByText("CLAIM");
    expect(claimCells.length).toBe(9);

    // Claim first cell
    fireEvent.click(claimCells[0]);

    // First cell now marked with red circle
    expect(screen.getByText("🔴")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("supports teacher MARK_CORRECT override action (F1/F2)", async () => {
    vi.useFakeTimers();
    const { rerender } = render(<BoardTeamBattle data={{}} />);

    advanceToQuestionPhase();

    // Trigger MARK_CORRECT from remote/commander inside act
    act(() => {
      lastAction = { type: "MARK_CORRECT" };
      rerender(<BoardTeamBattle data={{}} />);
    });

    expect(addPoints).toHaveBeenCalled();

    for (let i = 0; i < 3; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }

    expect(screen.getByText(/Claim Your Cell!/i)).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("handles STEAL_TURN and SWITCH_TURN remote actions (F1/F2)", async () => {
    vi.useFakeTimers();
    const { rerender } = render(<BoardTeamBattle data={{}} />);

    advanceToQuestionPhase();

    expect(screen.getByText(/RED/)).toBeInTheDocument();

    // Teacher offers steal
    act(() => {
      lastAction = { type: "STEAL_TURN" };
      rerender(<BoardTeamBattle data={{}} />);
    });

    expect(screen.getByText(/BLUE/)).toBeInTheDocument();
    expect(screen.getByText(/STEAL!/i)).toBeInTheDocument();

    // Teacher manually switches turn
    act(() => {
      lastAction = { type: "SWITCH_TURN" };
      rerender(<BoardTeamBattle data={{}} />);
    });

    expect(screen.getByText(/RED/)).toBeInTheDocument();
    vi.useRealTimers();
  });
  it("supports turn-based Word Bank sentence building and checking (F3)", async () => {
    vi.useFakeTimers();
    // Start with Q index 1 (WORD_BANK_BUILD)
    render(<BoardTeamBattle data={{}} />);

    advanceToQuestionPhase();

    // Advance to Q2 (word bank) via SWITCH_TURN or nextRound
    // Let us verify that Q1 can be answered to reach Q2
    fireEvent.click(screen.getByText("直升机"));
    for (let i = 0; i < 3; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }
    // Claim cell 0
    const claimCells = screen.getAllByText("CLAIM");
    fireEvent.click(claimCells[0]);

    // Now in Q2 (word bank)
    expect(screen.getByText(/Sentence Assembly Challenge/i)).toBeInTheDocument();
    expect(screen.getByText(/Build: "The cat is sleeping"/i)).toBeInTheDocument();

    // Click words to assemble
    fireEvent.click(screen.getByText("The"));
    fireEvent.click(screen.getByText("cat"));
    fireEvent.click(screen.getByText("is"));
    fireEvent.click(screen.getByText("sleeping"));

    // Check sentence
    fireEvent.click(screen.getByText(/Check Sentence/i));
    expect(addPoints).toHaveBeenCalled();

    for (let i = 0; i < 3; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }

    expect(screen.getByText(/Claim Your Cell!/i)).toBeInTheDocument();
    vi.useRealTimers();
  });
});
