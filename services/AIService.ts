import { supabase } from './supabaseClient';
import { reportApiError } from './errorReporting';
import { createClientLogger } from './logger';

const log = createClientLogger('AIService');

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
        log.info('generate_live_feedback');
        const { data, error } = await supabase.functions.invoke('generate-lesson', {
            body: { action: 'live-feedback', context }
        });

        if (error) {
            log.error('edge_function_error', { error: error.message, metadata: { fn: 'generate-lesson' } });
            reportApiError('generate-lesson', 0, error.message);
            throw new Error(error.message || 'Failed to generate live feedback.');
        }

        if (data && data.success === false) {
            log.error('edge_function_body_error', { error: data.error });
            reportApiError('generate-lesson', 200, data.error);
            throw new Error(data.error || 'Edge Function failed');
        }

        return data;
    },

    /**
     * Calls the Agent 2 Orchestrator Edge Function to safely publish assets to the final timeline.
     */
    async orchestrateLesson(unitId: string, approvedAssets: object): Promise<any> {
        log.info('orchestrate_lesson', { metadata: { unitId } });
        const { data, error } = await supabase.functions.invoke('orchestrate-lesson', {
            body: { unitId, approvedAssets }
        });

        if (error) {
            log.error('orchestration_error', { error: error.message, metadata: { unitId } });
            reportApiError('orchestrate-lesson', 0, error.message, { unitId });
            throw new Error(error.message || 'Failed to orchestrate lesson.');
        }

        if (data && data.success === false) {
            log.error('orchestration_body_error', { error: data.error, metadata: { unitId } });
            reportApiError('orchestrate-lesson', 200, data.error, { unitId });
            throw new Error(data.error || 'Edge Function failed');
        }

        return data;
    },

    async evaluatePronunciation(audioBase64: string, targetText: string, targetEmotion?: string, language?: string): Promise<any> {
        log.info('evaluate_pronunciation', { metadata: { targetTextLength: targetText.length, language: language || 'en' } });
        const { data, error } = await supabase.functions.invoke('evaluate-pronunciation', {
            body: { audioBase64, targetText, targetEmotion, language: language || 'en' }
        });

        if (error) {
            log.error('pronunciation_eval_error', { error: error.message });
            reportApiError('evaluate-pronunciation', 0, error.message);
            throw new Error(error.message || 'Failed to evaluate pronunciation.');
        }

        if (data && data.success === false) {
            log.error('pronunciation_eval_body_error', { error: data.error });
            reportApiError('evaluate-pronunciation', 200, data.error);
            throw new Error(data.error || 'Pronunciation evaluation failed');
        }

        return data?.evaluation || null;
    },

    /**
     * Calls the Generate Lesson Edge Function based on topic and grade level.
     * Optionally accepts documentContext for file-based curriculum generation.
     */
    async generateLessonContent(topic: string, gradeLevel: string, documentContext?: string, imageBase64?: string): Promise<GeneratedLesson> {
        log.info('generate_lesson', { metadata: { topic, gradeLevel, hasContext: !!documentContext, hasImage: !!imageBase64 } });

        const { data, error } = await supabase.functions.invoke('generate-lesson', {
            body: { topic, gradeLevel, documentContext, imageBase64 }
        });

        if (error) {
            log.error('generate_error', { error: error.message, metadata: { topic, gradeLevel } });
            reportApiError('generate-lesson', 0, error.message, { topic, gradeLevel });
            throw new Error(error.message || 'Failed to generate lesson from AI.');
        }

        if (data && data.success === false) {
            log.error('generate_body_error', { error: data.error });
            reportApiError('generate-lesson', 200, data.error, { topic });
            throw new Error(data.error || 'Edge Function failed');
        }

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
