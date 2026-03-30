import { AgentPipelineOutput, LessonManifest } from "../types/pipeline";
import { supabase } from './supabaseClient';

export * from "../types/pipeline";

export interface PronunciationResult {
  score: number;
  feedback: string;
  wordScores: { text: string; score: 'high' | 'medium' | 'low' | 'none' }[];
}

export const validateApiKey = async (): Promise<{ valid: boolean; message?: string }> => {
  return { valid: true };
};

export const generateLessonManifest = async (topic: string): Promise<LessonManifest | null> => {
  return null;
};

export const analyzeTextbookPage = async (imageBase64: string): Promise<LessonManifest | null> => {
  return null;
};

export const analyzeSyllabus = async (imageB64Array: string[]): Promise<LessonManifest[]> => {
  return [];
};

export const differentiateText = async (text: string, theme: string): Promise<{ below: string, on: string, above: string }> => {
  return { below: text, on: text, above: text };
};

export const generateSong = async (topic: string): Promise<{ title: string; lyrics: string } | null> => {
  return { title: "Song Gen Disabled", lyrics: "Feature pending..." };
};

export const generateImage = async (prompt: string): Promise<string | null> => {
  return null;
};

export interface DubbingResult {
  score: number;
  feedback: string;
  emotionMatch: 'high' | 'medium' | 'low';
  timing: 'perfect' | 'early' | 'late';
}

export const evaluateDubbing = async (audioBase64: string, targetText: string, targetEmotion: string): Promise<DubbingResult | null> => {
  return null;
};

export const checkPronunciation = async (audioBase64: string, targetText: string): Promise<PronunciationResult | null> => {
  return null;
};
