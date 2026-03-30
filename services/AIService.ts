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
    textContent: {
        title: string;
        description: string;
        visual_prompt?: string;
        spoken_intro?: string;
        flashcards: GeneratedFlashcard[];
    };
    imageUrl: string;
    audioUrl: string | null;
}

export const AIService = {
    /**
     * Calls the Edge Function to handle real-time lesson adjustments and feedback.
     */
    async generateLiveFeedback(context: string): Promise<any> {
        console.log("Generating Live Feedback via Edge Function...");
        const { data, error } = await supabase.functions.invoke('generate-lesson', {
            body: { action: 'live-feedback', context }
        });

        if (error) {
            console.error('Edge Function Error:', error);
            throw new Error(error.message || 'Failed to generate live feedback.');
        }
        return data;
    },

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

        if (!data || !data.textContent || !data.textContent.flashcards) {
            throw new Error('Received invalid data from AI generation.');
        }

        return data as GeneratedLesson;
    }
};
