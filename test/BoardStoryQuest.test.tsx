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
let manifestStoryPages: any[] = [
  { id: "p1", imageUrl: "https://example.com/p1.png", text: "Alice: Look at the magic tree!\nBob: It is glowing blue." },
  { id: "p2", imageUrl: "https://example.com/p2.png", text: "Narrator: The forest was quiet." },
];

vi.mock("../store/SessionContext", () => ({
  useSeedBase: () => "test-session|u1|0",
  useSession: () => ({
    state: {
      activeUnit: {
        id: "u1",
        manifest: {
          story: {
            title: "Magic Forest",
            pages: manifestStoryPages,
          },
          characters: [
            { name: "Alice", color: "#FF2D78" },
            { name: "Bob", color: "#38BDF8" },
          ],
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
    triggerConfetti,
  }),
}));

const mockPoolItems = [
  {
    id: "comp-1",
    exercise_type: "STORY_COMPREHENSION",
    difficulty: 2,
    content: {
      question: "What was glowing blue?",
      options: ["The magic tree", "The river", "The apple", "The stone"],
      correct_index: 0,
      explanation: "Bob said the magic tree is glowing blue.",
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

vi.mock("../services/boardLearner", () => ({
  gradeObjective: vi.fn().mockResolvedValue(undefined),
}));

const mockPlayCue = vi.fn();
vi.mock("../apps/board/templates/playCue", () => ({
  playCue: (cue: string) => mockPlayCue(cue),
}));

vi.mock("../services/SpeechService", () => ({
  playAudioUrl: vi.fn().mockResolvedValue(undefined),
  browserSpeak: vi.fn().mockResolvedValue(undefined),
}));

import BoardStoryQuest from "../apps/board/templates/BoardStoryQuest";

describe("BoardStoryQuest v3 (PRACTICE / OUTPUT)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastAction = null;
    currentTurnId = "turn-1";
    quickWheelWinner = "s1";
    manifestStoryPages = [
      { id: "p1", imageUrl: "https://example.com/p1.png", text: "Alice: Look at the magic tree!\nBob: It is glowing blue." },
      { id: "p2", imageUrl: "https://example.com/p2.png", text: "Narrator: The forest was quiet." },
    ];
  });

  it("renders storybook stage with uncropped illustration and parsed speaker dialogue", () => {
    render(<BoardStoryQuest data={{}} />);

    // Stage header and badges
    expect(screen.getByText(/Story Quest/i)).toBeInTheDocument();
    expect(screen.getByText("Page 1/2")).toBeInTheDocument();

    // Speaker turns parsed from text
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Look")).toBeInTheDocument();
    expect(screen.getByText("tree!")).toBeInTheDocument();
    expect(screen.getByText("glowing")).toBeInTheDocument();

    // Illustration is rendered with object-contain
    const img = screen.getByAltText("Story scene");
    expect(img).toBeInTheDocument();
    expect(img).toHaveClass("object-contain");
  });

  it("navigates via prediction choice and advances story", () => {
    render(<BoardStoryQuest data={{}} />);

    // Page 1 has prediction option
    const predictBtn = screen.getByRole("button", { name: /what happens next/i });
    fireEvent.click(predictBtn);

    // Enters prediction phase
    expect(screen.getByRole("heading", { name: "What happens next?" })).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("handles remote action SLIDE_COMPLETE directly to victory with trophy celebration", () => {
    const { rerender } = render(<BoardStoryQuest data={{}} />);

    lastAction = { type: "SLIDE_COMPLETE", timestamp: Date.now() };
    rerender(<BoardStoryQuest data={{}} />);

    expect(screen.getByText("Story Complete!")).toBeInTheDocument();
    expect(screen.getByText("📚")).toBeInTheDocument();
    expect(screen.getByText(/2 pages read/i)).toBeInTheDocument();
  });

  it("renders empty state with owner's animated 📚 trophy when no pages exist", () => {
    manifestStoryPages = [];
    render(<BoardStoryQuest data={{ pages: [] }} />);

    expect(screen.getByText(/This unit has no story pages yet/i)).toBeInTheDocument();
    expect(screen.getByText("📚")).toBeInTheDocument();
  });
});
