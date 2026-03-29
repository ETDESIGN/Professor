/**
 * AI Service for automated curriculum generation.
 * Calls Supabase Edge Function to securely process LLM requests.
 */

import { supabase } from './supabaseClient';

export interface GeneratedFlashcard {
    question: string;
    answer: string;
}

export interface GeneratedLesson {
    title: string;
    description: string;
    flashcards: GeneratedFlashcard[];
}

export const AIService = {
    /**
     * Calls the Generate Lesson Edge Function based on topic and grade level.
     */
    async generateLessonContent(topic: string, gradeLevel: string): Promise<GeneratedLesson> {
        console.log(`Generating AI Lesson for ${gradeLevel} on ${topic} via Edge Function...`);

        const { data, error } = await supabase.functions.invoke('generate-lesson', {
            body: { topic, gradeLevel }
        });

        if (error) {
            console.error('Edge Function Error:', error);
            throw new Error(error.message || 'Failed to generate lesson from AI.');
        }

        if (!data || !data.title || !data.flashcards) {
            throw new Error('Received invalid data from AI generation.');
        }

        return data as GeneratedLesson;
    }
};
