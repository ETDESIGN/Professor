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

        if (data && data.success === false) {
            console.error('Edge Function reported error:', data.error);
            throw new Error(data.error || 'Edge Function failed');
        }

        return data;
    },

    /**
     * Calls the Generate Lesson Edge Function based on topic and grade level.
     * Optionally accepts documentContext for file-based curriculum generation.
     */
    async generateLessonContent(topic: string, gradeLevel: string, documentContext?: string): Promise<GeneratedLesson> {
        console.log(`Generating AI Lesson for ${gradeLevel} on ${topic} via Edge Function...`);
        if (documentContext) {
            console.log(`With document context (${documentContext.length} characters)`);
        }

        const { data, error } = await supabase.functions.invoke('generate-lesson', {
            body: { topic, gradeLevel, documentContext }
        });

        if (error) {
            console.error('Edge Function Error:', error);
            throw new Error(error.message || 'Failed to generate lesson from AI.');
        }

        // Check if Edge Function returned an error in the body
        if (data && data.success === false) {
            console.error('Edge Function reported error:', data.error);
            throw new Error(data.error || 'Edge Function failed');
        }

        // Build resilient response with safe defaults for missing properties
        const textContent = data?.textContent || {};
        const flashcards = Array.isArray(textContent.flashcards) ? textContent.flashcards : [];

        return {
            textContent: {
                title: textContent.title || `${topic || 'Generated'} Lesson`,
                description: textContent.description || `A lesson about ${topic || 'this topic'} for ${gradeLevel} students.`,
                visual_prompt: textContent.visual_prompt || `Educational illustration about ${topic || 'learning'}`,
                spoken_intro: textContent.spoken_intro || `Welcome to today's lesson!`,
                flashcards: flashcards.length > 0 ? flashcards : [
                    { question: "What is the main topic?", answer: topic || "The lesson content" },
                    { question: "What grade level is this for?", answer: gradeLevel || "General" },
                    { question: "What should students learn?", answer: "Key concepts from the lesson" },
                    { question: "How can students practice?", answer: "Review the flashcards" },
                    { question: "What is the next step?", answer: "Continue to the next lesson" }
                ]
            },
            imageUrl: data?.imageUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(topic || 'lesson')}`,
            audioUrl: data?.audioUrl || null
        };
    }
};
