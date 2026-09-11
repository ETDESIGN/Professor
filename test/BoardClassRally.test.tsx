import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

vi.mock("../store/SessionContext", () => ({
  useSession: () => ({
    state: {
      activeUnit: {
        id: "u1",
        manifest: {},
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

const mockPoolItems = [
  {
    id: "rally-img-1",
    exercise_type: "IMAGE_SELECT",
    difficulty: 1,
    content: {
      prompt: "Find the tiger",
      options: [
        { label: "tiger", image_url: "https://example.com/tiger.png" },
        { label: "lion", image_url: "https://example.com/lion.png" },
        { label: "bear", image_url: "https://example.com/bear.png" },
        { label: "wolf", image_url: "https://example.com/wolf.png" },
      ],
      correct_index: 0,
      explanation: "A tiger has vibrant orange fur with black stripes.",
    },
  },
  {
    id: "rally-text-2",
    exercise_type: "MEANING_MATCH",
    difficulty: 1,
    content: {
      prompt: "rock",
      options: ["岩石", "河流", "森林", "天空"],
      correct_index: 0,
    },
  },
];

vi.mock("../apps/board/useBoardPool", () => ({
  useBoardPool: vi.fn(() => ({
    items: mockPoolItems,
    loading: false,
  })),
}));

vi.mock("../services/attemptsLog", () => ({
  recordAttempt: vi.fn().mockResolvedValue(undefined),
}));

const mockRecordChoralReview = vi.fn().mockResolvedValue(undefined);
vi.mock("../services/boardLearner", () => ({
  gradeObjective: vi.fn().mockResolvedValue(undefined),
  recordChoralReview: (...args: any[]) => mockRecordChoralReview(...args),
}));

const mockPlayCue = vi.fn();
vi.mock("../apps/board/templates/playCue", () => ({
  playCue: (cue: string) => mockPlayCue(cue),
}));

vi.mock("../services/SpeechService", () => ({
  playAudioUrl: vi.fn().mockResolvedValue(undefined),
  browserSpeak: vi.fn().mockResolvedValue(undefined),
}));

import BoardClassRally from "../apps/board/templates/BoardClassRally";

describe("BoardClassRally v3 (PRACTICE / CO-OP)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastAction = null;
    currentTurnId = "turn-1";
    quickWheelWinner = "s1";
  });

  it("renders Hero Rally Bar, target telemetry, and student turn context", () => {
    render(<BoardClassRally data={{}} />);

    expect(screen.getByText("NEON ARENA")).toBeInTheDocument();
    expect(screen.getByText(/PHASE: CLASS RALLY/i)).toBeInTheDocument();
    expect(screen.getAllByText("0 / 12").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("COLLECTIVE ENERGY")).toBeInTheDocument();
    expect(screen.getByText(/12 MORE WORDS/i)).toBeInTheDocument();
    expect(screen.getByText("Alice's")).toBeInTheDocument();
  });

  it("F1 (Owner Priority): Image cards render IMAGE ONLY without visible vocabulary text labels", () => {
    render(<BoardClassRally data={{}} />);

    // Prompt is displayed
    expect(screen.getByText("Find the tiger")).toBeInTheDocument();

    // Option cards have images with alt attributes
    const tigerImg = screen.getByAltText("tiger");
    const lionImg = screen.getByAltText("lion");
    expect(tigerImg).toBeInTheDocument();
    expect(lionImg).toBeInTheDocument();
    expect(tigerImg).toHaveAttribute("src", "https://example.com/tiger.png");

    // Option letters A, B, C, D are present
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();
    expect(screen.getByText("D")).toBeInTheDocument();

    // CRITICAL (F1): Text labels "tiger", "lion", "bear", "wolf" must NOT be rendered as visible text elements!
    expect(screen.queryByText("bear")).toBeNull();
    expect(screen.queryByText("wolf")).toBeNull();
  });

  it("scores correct pick and updates collective rally bar", () => {
    render(<BoardClassRally data={{}} />);

    // Click correct option A (tiger image)
    const tigerImg = screen.getByAltText("tiger");
    const optionCard = tigerImg.closest("button");
    expect(optionCard).not.toBeNull();
    fireEvent.click(optionCard!);

    expect(addPoints).toHaveBeenCalledWith("s1", expect.any(Number));
    expect(mockPlayCue).toHaveBeenCalledWith("correct");
    expect(screen.getByText(/Alice filled the bar!/i)).toBeInTheDocument();
  });

  it("supports choral sub-mode with teacher hotplates", () => {
    const { rerender } = render(<BoardClassRally data={{}} />);

    // Trigger CHORAL_ROUND after mount
    lastAction = { type: "CHORAL_ROUND", timestamp: Date.now() };
    rerender(<BoardClassRally data={{}} />);

    expect(screen.getByText(/EVERYONE!/i)).toBeInTheDocument();
    expect(screen.getByText(/The whole class answers together!/i)).toBeInTheDocument();

    const nailedItBtn = screen.getByText(/CLASS NAILED IT/i);
    const needsPracticeBtn = screen.getByText(/NEEDS PRACTICE/i);
    expect(nailedItBtn).toBeInTheDocument();
    expect(needsPracticeBtn).toBeInTheDocument();

    // Teacher marks strong choral answer
    fireEvent.click(nailedItBtn);

    expect(mockRecordChoralReview).toHaveBeenCalledWith(undefined, ["s1", "s2"], "strong");
    expect(mockPlayCue).toHaveBeenCalledWith("correct");
    expect(triggerConfetti).toHaveBeenCalled();
  });

  it("renders victory screen with owner's animated trophy celebration", () => {
    const { rerender } = render(<BoardClassRally data={{}} />);

    lastAction = { type: "SLIDE_COMPLETE", timestamp: Date.now() };
    rerender(<BoardClassRally data={{}} />);

    expect(screen.getByText("RALLY COMPLETE!")).toBeInTheDocument();
    expect(screen.getByText("🏆")).toBeInTheDocument();
    expect(screen.getByText(/The whole class hit 12 correct answers together!/i)).toBeInTheDocument();
  });
});
