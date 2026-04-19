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
        
        // Return mock data if API key not configured
        if (!import.meta.env.VITE_GEMINI_API_KEY) {
            log.warn('gemini_api_key_not_configured');
            return this.getMockLiveFeedback(context);
        }

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
        
        // Return mock data if API key not configured
        if (!import.meta.env.VITE_GEMINI_API_KEY) {
            log.warn('gemini_api_key_not_configured');
            return this.getMockOrchestration(unitId, approvedAssets);
        }

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
        
        // Return mock data if API key not configured
        if (!import.meta.env.VITE_GEMINI_API_KEY) {
            log.warn('gemini_api_key_not_configured');
            return this.getMockPronunciationEvaluation(targetText);
        }

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

        // Return mock data if API key not configured
        if (!import.meta.env.VITE_GEMINI_API_KEY) {
            log.warn('gemini_api_key_not_configured');
            return this.getMockLessonContent(topic, gradeLevel);
        }

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
    },

    /**
     * Mock responses for when API key is not configured
     */
    getMockLiveFeedback(context: string) {
        log.warn('Returning mock live feedback');
        return {
            success: true,
            feedback: `AI analysis for: ${context}`,
            suggestions: ['Increase visual engagement', 'Add interactive elements'],
            timestamp: new Date().toISOString()
        };
    },

    getMockOrchestration(unitId: string, approvedAssets: object) {
        log.warn('Returning mock orchestration');
        return {
            success: true,
            unitId,
            publishedAssets: approvedAssets,
            timelineId: `timeline_${Date.now()}`,
            timestamp: new Date().toISOString()
        };
    },

    getMockPronunciationEvaluation(targetText: string) {
        log.warn('Returning mock pronunciation evaluation');
        return {
            evaluation: {
                targetText,
                score: 0.85,
                feedback: 'Good pronunciation, minor improvements needed',
                phonemeAnalysis: [
                    { phoneme: 'th', accuracy: 0.9, timing: 0.95 },
                    { phoneme: 's', accuracy: 0.8, timing: 0.85 }
                ],
                timestamp: new Date().toISOString()
            }
        };
    },

    getMockLessonContent(topic: string, gradeLevel: string) {
        log.warn('Returning mock lesson content');
        return {
            textContent: {
                title: `${topic || 'Generated'} Lesson`,
                description: `A lesson about ${topic || 'this topic'} for ${gradeLevel} students.`,
                visual_prompt: `Educational illustration about ${topic || 'learning'}`,
                spoken_intro: `Welcome to today's lesson!`,
                vocabulary: [
                    { word: topic || "Vocabulary", definition: `A key term from ${topic || "the lesson"}` },
                    { word: "Lesson", definition: "A period of teaching or learning" },
                    { word: "Study", definition: "The activity of learning about a subject" }
                ],
                grammarRules: [
                    { rule: "Basic Sentence Structure", explanation: "A sentence needs a subject and a verb." }
                ],
                sentences: [
                    { original: `We are learning about ${topic || "this topic"}.`, translation: `We are studying ${topic || "this subject"}.` },
                    { original: "Please open your textbook.", translation: "Please open your book for studying." }
                ]
            },
            imageUrl: `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(topic || 'lesson')}`,
            audioUrl: null
        };
    }
};