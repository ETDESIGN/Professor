/**
 * AI Service for automated curriculum generation.
 * Calls Supabase Edge Function to securely process LLM requests.
 */

import { supabase } from './supabaseClient';

export interface GeneratedLesson {
    textContent: {
        title: string;
        description: string;
        visual_prompt?: string;
        spoken_intro?: string;
        vocabulary: { word: string; definition: string }[];
        grammarRules: { rule: string; explanation: string }[];
        sentences: { original: string; translation: string }[];
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
     * Calls the Agent 2 Orchestrator Edge Function to safely publish assets to the final timeline.
     */
    async orchestrateLesson(unitId: string, approvedAssets: object): Promise<any> {
        console.log(`Orchestrating Lesson via Agent 2 for unit ${unitId}...`);
        const { data, error } = await supabase.functions.invoke('orchestrate-lesson', {
            body: { unitId, approvedAssets }
        });

        if (error) {
            console.error('Edge Function Error:', error);
            throw new Error(error.message || 'Failed to orchestrate lesson.');
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
    async generateLessonContent(topic: string, gradeLevel: string, documentContext?: string, imageBase64?: string): Promise<GeneratedLesson> {
        console.log(`Generating AI Lesson for ${gradeLevel} on ${topic} via Edge Function...`);
        if (documentContext) {
            console.log(`With document context (${documentContext.length} characters)`);
        }
        if (imageBase64) {
            console.log(`With image base64 (${imageBase64.length} characters)`);
        }

        const { data, error } = await supabase.functions.invoke('generate-lesson', {
            body: { topic, gradeLevel, documentContext, imageBase64 }
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

        console.log('Edge Function raw response:', JSON.stringify(data).substring(0, 1000));

        // Build resilient response with safe defaults for missing properties
        const textContent = data?.textContent || {};
        const vocabulary = Array.isArray(textContent.vocabulary) ? textContent.vocabulary : [];
        const grammarRules = Array.isArray(textContent.grammarRules) ? textContent.grammarRules : [];
        const sentences = Array.isArray(textContent.sentences) ? textContent.sentences : [];

        return {
            textContent: {
                title: textContent.title || `${topic || 'Generated'} Lesson`,
                description: textContent.description || `A lesson about ${topic || 'this topic'} for ${gradeLevel} students.`,
                visual_prompt: textContent.visual_prompt || `Educational illustration about ${topic || 'learning'}`,
                spoken_intro: textContent.spoken_intro || `Welcome to today's lesson!`,
                vocabulary: vocabulary.length > 0 ? vocabulary : [
                    { word: topic || "Vocabulary", definition: `A key term from ${topic || "the lesson"}` },
                    { word: "Lesson", definition: "A period of teaching or learning" },
                    { word: "Study", definition: "The activity of learning about a subject" }
                ],
                grammarRules: grammarRules.length > 0 ? grammarRules : [
                    { rule: "Basic Sentence Structure", explanation: "A sentence needs a subject and a verb." }
                ],
                sentences: sentences.length > 0 ? sentences : [
                    { original: `We are learning about ${topic || "this topic"}.`, translation: `We are studying ${topic || "this subject"}.` },
                    { original: "Please open your textbook.", translation: "Please open your book for studying." }
                ]
            },
            imageUrl: data?.imageUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(topic || 'lesson')}`,
            audioUrl: data?.audioUrl || null
        };
    }
};
