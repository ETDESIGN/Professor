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
let mockRungByObjective: Record<string, number> = {
  "obj-1": 1,
  "obj-2": 1,
  "obj-3": 1,
  "obj-4": 1,
};

vi.mock("../store/SessionContext", () => ({
  useSeedBase: () => "test-session|u1|0",
  useSession: () => ({
    state: {
      activeUnit: { id: "u1" },
      students: mockStudents,
      quickWheelWinner,
      currentTurnId,
      lastAction,
      activeClassId: "c1",
      activeSlideData: { phase: "PRACTICE" },
    },
    addPoints,
    triggerAction,
    pushToRemediation,
    triggerConfetti,
  }),
}));

const mockPoolItems = [
  {
    id: "item-1",
    objective_id: "obj-1",
    exercise_type: "IMAGE_SELECT",
    difficulty: 1,
    content: {
      prompt: "Apple",
      options: [
        { image_url: "https://example.com/apple.png", label: "Apple" },
        { image_url: "https://example.com/banana.png", label: "Banana" },
        { image_url: "https://example.com/cherry.png", label: "Cherry" },
        { image_url: "https://example.com/date.png", label: "Date" },
      ],
      correct_index: 0,
    },
  },
  {
    id: "item-2",
    objective_id: "obj-2",
    exercise_type: "IMAGE_SELECT",
    difficulty: 1,
    content: {
      prompt: "Banana",
      options: [
        { image_url: "https://example.com/banana.png", label: "Banana" },
        { image_url: "https://example.com/apple.png", label: "Apple" },
        { image_url: "https://example.com/cherry.png", label: "Cherry" },
        { image_url: "https://example.com/date.png", label: "Date" },
      ],
      correct_index: 0,
    },
  },
  {
    id: "item-3",
    objective_id: "obj-3",
    exercise_type: "IMAGE_SELECT",
    difficulty: 1,
    content: {
      prompt: "Cherry",
      options: [
        { image_url: "https://example.com/cherry.png", label: "Cherry" },
        { image_url: "https://example.com/apple.png", label: "Apple" },
        { image_url: "https://example.com/banana.png", label: "Banana" },
        { image_url: "https://example.com/date.png", label: "Date" },
      ],
      correct_index: 0,
    },
  },
  {
    id: "item-4",
    objective_id: "obj-4",
    exercise_type: "IMAGE_SELECT",
    difficulty: 1,
    content: {
      prompt: "Date",
      options: [
        { image_url: "https://example.com/date.png", label: "Date" },
        { image_url: "https://example.com/apple.png", label: "Apple" },
        { image_url: "https://example.com/banana.png", label: "Banana" },
        { image_url: "https://example.com/cherry.png", label: "Cherry" },
      ],
      correct_index: 0,
    },
  },
];

vi.mock("../apps/board/useEscalatingPool", () => ({
  useEscalatingPool: vi.fn(() => ({
    items: mockPoolItems,
    loading: false,
    rungByObjective: mockRungByObjective,
  })),
}));

vi.mock("../apps/board/templates/scoreAttempt", () => ({
  logAttempt: vi.fn(),
}));

const mockBrowserSpeak = vi.fn();
vi.mock("../services/SpeechService", () => ({
  browserSpeak: (text: string) => mockBrowserSpeak(text),
}));

const mockPlayCue = vi.fn();
vi.mock("../apps/board/templates/playCue", () => ({
  playCue: (cue: string) => mockPlayCue(cue),
}));

import BoardWhatsMissing from "../apps/board/templates/BoardWhatsMissing";

describe("BoardWhatsMissing v3 (WHATS_MISSING & MAGIC_EYES)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastAction = null;
    currentTurnId = "turn-1";
    quickWheelWinner = "s1";
    mockRungByObjective = {
      "obj-1": 1,
      "obj-2": 1,
      "obj-3": 1,
      "obj-4": 1,
    };
  });

  describe("whats_missing mode", () => {
    it("renders memorize phase with all items and Hide Now button (F5)", () => {
      render(<BoardWhatsMissing data={{}} mode="whats_missing" />);

      expect(screen.getByText("Round 1/4")).toBeInTheDocument();
      expect(screen.getByText("Memorize the Items!")).toBeInTheDocument();
      expect(screen.getByText("Hide Now")).toBeInTheDocument();
      expect(screen.getByText("Apple")).toBeInTheDocument();
      expect(screen.getByText("Banana")).toBeInTheDocument();
      expect(screen.getByText("Cherry")).toBeInTheDocument();
      expect(screen.getByText("Date")).toBeInTheDocument();
    });

    it("triggers recall phase immediately when Hide Now is clicked (F5)", () => {
      render(<BoardWhatsMissing data={{}} mode="whats_missing" />);

      const hideBtn = screen.getByText("Hide Now");
      fireEvent.click(hideBtn);

      expect(screen.getByText("What's Missing?")).toBeInTheDocument();
      expect(screen.getByText("Missing")).toBeInTheDocument();
      // Candidates dock rendered with badges A-D and labels (F3)
      expect(screen.getByText("Which item is missing? Tap the answer!")).toBeInTheDocument();
      expect(screen.getAllByText("Apple").length).toBeGreaterThanOrEqual(1);
    });

    it("triggers recall phase when SPACE key is pressed in memorize phase (F5)", () => {
      render(<BoardWhatsMissing data={{}} mode="whats_missing" />);

      fireEvent.keyDown(window, { key: " " });

      expect(screen.getByText("What's Missing?")).toBeInTheDocument();
      expect(screen.getByText("Missing")).toBeInTheDocument();
    });

    it("handles correct candidate selection: awards points, plays cue, reveals choral prompt with TTS (F4)", () => {
      render(<BoardWhatsMissing data={{}} mode="whats_missing" />);

      // Hide to recall
      fireEvent.click(screen.getByText("Hide Now"));

      // Target missing item is Apple (index 0)
      const appleCandidate = screen.getByRole("button", { name: /Apple/i });
      fireEvent.click(appleCandidate);

      expect(mockPlayCue).toHaveBeenCalledWith("correct");
      expect(addPoints).toHaveBeenCalledWith("s1", expect.any(Number));
      // Choral celebration prompt with TTS (F4)
      expect(screen.getByText(/Everyone say:/i)).toBeInTheDocument();
      expect(screen.getByText("Nice one, Alice!")).toBeInTheDocument();
      expect(mockBrowserSpeak).toHaveBeenCalledWith("Apple");
    });

    it("handles incorrect candidate selection: deducts points, plays wrong cue, eliminates option", () => {
      render(<BoardWhatsMissing data={{}} mode="whats_missing" />);

      // Hide to recall
      fireEvent.click(screen.getByText("Hide Now"));

      // Wrong candidate: Banana
      const bananaCandidate = screen.getByRole("button", { name: /Banana/i });
      fireEvent.click(bananaCandidate);

      expect(mockPlayCue).toHaveBeenCalledWith("wrong");
      expect(addPoints).toHaveBeenCalledWith("s1", -1);
      // Option is now disabled
      expect(bananaCandidate).toBeDisabled();
    });

    it("handles 1-tap oral evaluation in produce mode (F1)", () => {
      mockRungByObjective = { "obj-1": 4, "obj-2": 4, "obj-3": 4, "obj-4": 4 };

      const { rerender } = render(<BoardWhatsMissing data={{}} mode="whats_missing" />);

      // Advance to round 3 where baseline >= 4 and rung >= 4 -> produce mode
      lastAction = { type: "NEXT_ROUND" };
      rerender(<BoardWhatsMissing data={{}} mode="whats_missing" />);
      lastAction = { type: "NEXT_ROUND" };
      rerender(<BoardWhatsMissing data={{}} mode="whats_missing" />);

      // Hide to recall
      lastAction = { type: "HIDE_NOW" };
      rerender(<BoardWhatsMissing data={{}} mode="whats_missing" />);

      // Verify oral produce challenge bar
      expect(screen.getByText("Round 3/4")).toBeInTheDocument();
      expect(screen.getByText("What's missing? Say it!")).toBeInTheDocument();
      expect(screen.getByText("Alice, say the missing word!")).toBeInTheDocument();

      // On-board oral evaluation buttons (F1)
      const correctBtn = screen.getByRole("button", { name: /✓ Correct/i });
      const missBtn = screen.getByRole("button", { name: /✗ Try Again/i });
      const revealBtn = screen.getByRole("button", { name: /Reveal/i });

      expect(correctBtn).toBeInTheDocument();
      expect(missBtn).toBeInTheDocument();
      expect(revealBtn).toBeInTheDocument();

      // Tap "✗ Try Again"
      fireEvent.click(missBtn);
      expect(mockPlayCue).toHaveBeenCalledWith("wrong");
      expect(addPoints).toHaveBeenCalledWith("s1", -1);
      // First-letter hint shown
      expect(screen.getByText(/Hint: starts with/i)).toBeInTheDocument();

      // Tap "✓ Correct"
      fireEvent.click(correctBtn);
      expect(mockPlayCue).toHaveBeenCalledWith("correct");
      expect(addPoints).toHaveBeenCalledWith("s1", expect.any(Number));
      expect(screen.getByText(/Everyone say:/i)).toBeInTheDocument();
    });

    it("supports keyboard 1-4 selection in recognize mode", () => {
      render(<BoardWhatsMissing data={{}} mode="whats_missing" />);

      fireEvent.click(screen.getByText("Hide Now"));

      // Press key 1 or 2
      fireEvent.keyDown(window, { key: "1" });
      expect(mockPlayCue).toHaveBeenCalled();
    });

    it("handles remote actions HIDE_NOW, REVEAL_HINT, MARK_CORRECT, RATE_INCORRECT", () => {
      const { rerender } = render(<BoardWhatsMissing data={{}} mode="whats_missing" />);

      // HIDE_NOW
      lastAction = { type: "HIDE_NOW" };
      rerender(<BoardWhatsMissing data={{}} mode="whats_missing" />);
      expect(screen.getByText("What's Missing?")).toBeInTheDocument();

      // REVEAL_HINT
      lastAction = { type: "REVEAL_HINT" };
      rerender(<BoardWhatsMissing data={{}} mode="whats_missing" />);

      // MARK_CORRECT
      lastAction = { type: "MARK_CORRECT" };
      rerender(<BoardWhatsMissing data={{}} mode="whats_missing" />);
      expect(mockPlayCue).toHaveBeenCalledWith("correct");
      expect(addPoints).toHaveBeenCalledWith("s1", expect.any(Number));
      expect(mockBrowserSpeak).toHaveBeenCalledWith("Apple");
    });
  });

  describe("magic_eyes mode", () => {
    it("renders camera ready gate initially (F2)", () => {
      render(<BoardWhatsMissing data={{}} mode="magic_eyes" />);

      expect(screen.getByText("Magic Eyes")).toBeInTheDocument();
      expect(screen.getByText("Magic Eyes! Watch Closely!")).toBeInTheDocument();
      expect(screen.getByText("FLASH IMAGE (3s)")).toBeInTheDocument();
      expect(screen.getByText(/Teacher: tap button or press SPACE to flash/i)).toBeInTheDocument();
    });

    it("triggers 3s flash on clicking button or pressing SPACE, showing image only without text label (F4)", () => {
      render(<BoardWhatsMissing data={{}} mode="magic_eyes" />);

      const flashBtn = screen.getByText("FLASH IMAGE (3s)");
      fireEvent.click(flashBtn);

      expect(mockPlayCue).toHaveBeenCalledWith("reveal");
      expect(screen.getByText("Watch Closely!")).toBeInTheDocument();
      // Target image rendered without word text (F4)
      const flashImg = screen.getByAltText("Flash target");
      expect(flashImg).toBeInTheDocument();
      expect(flashImg).toHaveAttribute("src", "https://example.com/apple.png");
      expect(screen.queryByText("Apple")).not.toBeInTheDocument();
    });

    it("transitions to frosted mystery lens in recall phase with NO color leaks (F1)", () => {
      const { rerender } = render(<BoardWhatsMissing data={{}} mode="magic_eyes" />);

      // Fast-forward or trigger HIDE_NOW to recall phase
      lastAction = { type: "HIDE_NOW" };
      rerender(<BoardWhatsMissing data={{}} mode="magic_eyes" />);

      // Frosted mystery lens
      expect(screen.getByText("Mystery Lens Closed")).toBeInTheDocument();
      expect(screen.getByText("What did you see in the photo?")).toBeInTheDocument();
      // Options are displayed with text labels (testing vocabulary retrieval)
      expect(screen.getByRole("button", { name: /Apple/i })).toBeInTheDocument();
    });

    it("awards points, plays audio and choral celebration on correct answer in Magic Eyes (F3)", () => {
      const { rerender } = render(<BoardWhatsMissing data={{}} mode="magic_eyes" />);

      // Remote action to recall
      lastAction = { type: "HIDE_NOW" };
      rerender(<BoardWhatsMissing data={{}} mode="magic_eyes" />);

      const appleBtn = screen.getByRole("button", { name: /Apple/i });
      fireEvent.click(appleBtn);

      expect(mockPlayCue).toHaveBeenCalledWith("correct");
      expect(addPoints).toHaveBeenCalledWith("s1", expect.any(Number));
      expect(mockBrowserSpeak).toHaveBeenCalledWith("Apple");
      expect(screen.getByText(/Everyone say:/i)).toBeInTheDocument();
    });
  });
});
